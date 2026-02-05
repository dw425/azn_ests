// backend/utils/security.js

// Regex: Min 8 chars, 1 Uppercase, 1 Number, 1 Special Char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateRegistration = (username, email, password) => {
    const errors = [];

    // 1. Check for Empty or Blank fields
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        errors.push("Username is required.");
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        errors.push("Email is required.");
    }
    if (!password || typeof password !== 'string' || password.trim().length === 0) {
        errors.push("Password is required.");
    }

    // 2. Check Email Format
    if (email && !EMAIL_REGEX.test(email.trim())) {
        errors.push("Invalid email format.");
    }

    // 3. Strict Password Requirements
    if (password && !PASSWORD_REGEX.test(password)) {
        errors.push("Password must be at least 8 chars, include 1 uppercase, 1 number, and 1 special char.");
    }

    return errors;
};

module.exports = { validateRegistration };
