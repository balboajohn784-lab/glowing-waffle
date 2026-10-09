require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseServiceRoleKey || !adminUsername || !adminPassword) {
  console.error("Error: Missing required environment variables.");
  console.error("Please ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USERNAME, and ADMIN_PASSWORD are all set in your .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function createAdmin() {
  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    const { data, error } = await supabase
      .from("admins")
      .insert([
        {
          username: adminUsername,
          password_hash: passwordHash
        }
      ])
      .select();

    if (error) {
      if (error.code === "23505") {
        console.log(`Admin creation skipped: Username "${adminUsername}" already exists in the database.`);
        process.exit(0);
      }
      console.error("Error creating admin user:", error.message);
      process.exit(1);
    }

    console.log(`Admin user "${adminUsername}" was successfully created.`);
    process.exit(0);
  } catch (err) {
    console.error("An unexpected error occurred:", err.message);
    process.exit(1);
  }
}

createAdmin();