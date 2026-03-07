// Auto-detect: use local backend when browsing from localhost, Render when deployed
window.API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
  ? "http://127.0.0.1:8000"
  : "https://jfcm-taytay-backend.onrender.com";
window.GOOGLE_API_KEY = "AIzaSyDk3gC-skBMBV15KtpLhOCieK99KUBxtvY";
window.EMAILJS_PUBLIC_KEY = "UBJFFO4Xb6aSN41Tm";
window.EMAILJS_SERVICE_ID = "service_7m4ex1k";
window.EMAILJS_TEMPLATE_ID = "template_upsn1uh";

/**
 * Escape user-supplied strings before inserting into innerHTML.
 * Use this on any data that originates from the database or user input.
 */
window.escapeHtml = function (str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};