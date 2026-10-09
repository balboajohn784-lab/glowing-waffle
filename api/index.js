require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

// 1. Environment Variables Validation
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

const missingVars = [];
if (!supabaseUrl) missingVars.push("SUPABASE_URL");
if (!supabaseServiceRoleKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
if (!jwtSecret) missingVars.push("JWT_SECRET");

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
}

// 2. Client Initialization
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const app = express();

// 3. Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend files from public folder
app.use(express.static(path.join(__dirname, "../public")));

// JWT Authentication Middleware for Admin Routes
function authenticateAdmin(req, res, next) {
  const token = req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.admin = decoded;
    next();
  } catch (err) {
    console.error("JWT Verification Error:", err.message);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

// -----------------------------------------------------------------------------
// PUBLIC ROUTES
// -----------------------------------------------------------------------------

// GET /api/services - Returns active services ordered by name
app.get("/api/services", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, description, price, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching services:", error.message);
      return res.status(500).json({ error: "Failed to retrieve active services" });
    }

    return res.json(data);
  } catch (err) {
    console.error("Unexpected error in GET /api/services:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/bookings - Submit a booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { service_id, name, contact, email, booking_date, booking_time, guests, notes } = req.body;

    // Validate required fields
    if (!service_id || !name || !contact || !email || !booking_date || !booking_time) {
      return res.status(400).json({ error: "All required fields must be provided" });
    }

    // Validate date (no past dates allowed)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(booking_date);
    if (isNaN(selectedDate.getTime()) || selectedDate < today) {
      return res.status(400).json({ error: "Booking date cannot be in the past" });
    }

    // Validate booking time (must be between 07:00 and 17:00)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
    if (!timeRegex.test(booking_time)) {
      return res.status(400).json({ error: "Invalid booking time format (HH:MM required)" });
    }

    const [hours, minutes] = booking_time.split(":").map(Number);
    if (hours < 7 || hours > 17 || (hours === 17 && minutes > 0)) {
      return res.status(400).json({ error: "Booking time must be between 07:00 and 17:00" });
    }

    // Validate guest count (minimum 1)
    const guestCount = guests ? parseInt(guests, 10) : 1;
    if (isNaN(guestCount) || guestCount < 1) {
      return res.status(400).json({ error: "Guest count must be at least 1" });
    }

    // Generate unique reference string: BKXXXXXX (BK + 6 random alphanumeric characters)
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const reference = `BK${randomCode}`;

    const { data, error } = await supabase
      .from("bookings")
      .insert([
        {
          reference,
          service_id,
          name,
          contact,
          email,
          booking_date,
          booking_time,
          guests: guestCount,
          notes: notes || null,
          status: "pending"
        }
      ])
      .select("reference")
      .single();

    if (error) {
      console.error("Error creating booking:", error.message);
      return res.status(500).json({ error: "Failed to create booking" });
    }

    return res.status(201).json({
      message: "Booking successfully created",
      reference: data.reference
    });
  } catch (err) {
    console.error("Unexpected error in POST /api/bookings:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bookings/:reference - Get booking details with service name
app.get("/api/bookings/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .select("id, reference, name, contact, email, booking_date, booking_time, guests, notes, status, created_at, services(name, price)")
      .eq("reference", reference)
      .single();

    if (error || !data) {
      console.error("Booking reference not found:", reference);
      return res.status(404).json({ error: "Booking reference not found" });
    }

    const formattedData = {
      id: data.id,
      reference: data.reference,
      name: data.name,
      contact: data.contact,
      email: data.email,
      booking_date: data.booking_date,
      booking_time: data.booking_time,
      guests: data.guests,
      notes: data.notes,
      status: data.status,
      created_at: data.created_at,
      service_name: data.services ? data.services.name : "N/A",
      service_price: data.services ? data.services.price : null
    };

    return res.json(formattedData);
  } catch (err) {
    console.error("Unexpected error in GET /api/bookings/:reference:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------------------------------------
// ADMIN AUTHENTICATION ROUTES
// -----------------------------------------------------------------------------

// POST /api/admin/login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, username, password_hash")
      .eq("username", username)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      jwtSecret,
      { expiresIn: "24h" }
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("admin_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    return res.json({ message: "Login successful", username: admin.username });
  } catch (err) {
    console.error("Unexpected error in POST /api/admin/login:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/logout
app.post("/api/admin/logout", (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("admin_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction
  });
  return res.json({ message: "Logout successful" });
});

// -----------------------------------------------------------------------------
// PROTECTED ADMIN ROUTES
// -----------------------------------------------------------------------------

// GET /api/admin/bookings - Returns all bookings, newest first
app.get("/api/admin/bookings", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, reference, name, contact, email, booking_date, booking_time, guests, notes, status, created_at, services(name, price)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching admin bookings:", error.message);
      return res.status(500).json({ error: "Failed to retrieve bookings" });
    }

    const formattedBookings = data.map((b) => ({
      id: b.id,
      reference: b.reference,
      name: b.name,
      contact: b.contact,
      email: b.email,
      booking_date: b.booking_date,
      booking_time: b.booking_time,
      guests: b.guests,
      notes: b.notes,
      status: b.status,
      created_at: b.created_at,
      service_name: b.services ? b.services.name : "N/A",
      service_price: b.services ? b.services.price : null
    }));

    return res.json(formattedBookings);
  } catch (err) {
    console.error("Unexpected error in GET /api/admin/bookings:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/bookings/:id/confirm - Confirm a booking
app.patch("/api/admin/bookings/:id/confirm", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error confirming booking:", error ? error.message : "Not found");
      return res.status(404).json({ error: "Booking not found or could not be updated" });
    }

    return res.json({ message: "Booking confirmed successfully", booking: data });
  } catch (err) {
    console.error("Unexpected error in PATCH /api/admin/bookings/:id/confirm:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/bookings/:id/cancel - Cancel a booking
app.patch("/api/admin/bookings/:id/cancel", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error cancelling booking:", error ? error.message : "Not found");
      return res.status(404).json({ error: "Booking not found or could not be updated" });
    }

    return res.json({ message: "Booking cancelled successfully", booking: data });
  } catch (err) {
    console.error("Unexpected error in PATCH /api/admin/bookings/:id/cancel:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/bookings/:id - Delete a booking
app.delete("/api/admin/bookings/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting booking:", error.message);
      return res.status(500).json({ error: "Failed to delete booking" });
    }

    return res.json({ message: "Booking deleted successfully" });
  } catch (err) {
    console.error("Unexpected error in DELETE /api/admin/bookings/:id:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});



module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}