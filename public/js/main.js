// Utility Functions for Formatting & Display

function formatPesos(amount) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP"
  }).format(numericAmount);
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function formatTime(timeString) {
  if (!timeString) return "N/A";
  const parts = timeString.split(":");
  if (parts.length < 2) return timeString;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

function showBanner(message, isError = false) {
  const banner = document.getElementById("banner");
  if (!banner) return;
  
  banner.textContent = message;
  banner.className = `banner visible ${isError ? "banner-error" : "banner-success"}`;
}

function hideBanner() {
  const banner = document.getElementById("banner");
  if (banner) {
    banner.className = "banner";
  }
}

function clearErrorMessages() {
  const errors = document.querySelectorAll(".field-error");
  errors.forEach((error) => {
    error.textContent = "";
    error.classList.remove("visible");
  });
}

function showFieldError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }
}