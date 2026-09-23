const dns = require("dns");
const net = require("net");

const socket = net.createConnection(
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    timeout: 10000
  },
  () => {
    console.log("AIVEN TCP TEST: CONNECTED");
    socket.end();
  }
);

socket.on("error", (err) => {
  console.log("AIVEN TCP TEST ERROR:", err.code, err.message);
});

socket.on("timeout", () => {
  console.log("AIVEN TCP TEST: TIMEOUT");
  socket.destroy();
});

dns.lookup(
  "mysql-31644d4d-nikhilkush2425-bb6e.h.aivencloud.com",
  { all: true },
  (err, addresses) => {
    console.log("AIVEN DNS TEST:", err || addresses);
  }
);
const express = require("express");
require("dotenv").config();
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 30000,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test route
app.get("/", (req, res) => {
    res.json({
        message: "Gym website backend is running"
    });
});

// Signup API
app.post("/api/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        // Check if email already exists
        const [existingUser] = await db.execute(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Save user
        const [result] = await db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        res.status(201).json({
            message: "User registered successfully",
            userId: result.insertId
        });

    } catch (error) {
        console.error("Signup error:", error);

        res.status(500).json({
            message: "Server error"
        });
    }
});
// Login API
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        // Find user
        const [users] = await db.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = users[0];

        // Check password
        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Save login history
        await db.execute(
            "INSERT INTO login_history (user_id) VALUES (?)",
            [user.id]
        );

        // Login successful
        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Server error"
        });
    }
});
app.get("/api/login-history/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [history] = await db.execute(
            `SELECT login_time
             FROM login_history
             WHERE user_id = ?
             ORDER BY login_time DESC`,
            [userId]
        );

        res.json(history);

    } catch (error) {
        console.error("Login history error:", error);

        res.status(500).json({
            message: "Server error"
        });
    }
});
// =========================
// ADMIN - TOTAL LOGINS
// =========================

app.get("/api/admin/total-logins", async (req, res) => {

    try {

        const [result] = await db.execute(
            "SELECT COUNT(*) AS total FROM login_history"
        );

        res.json({
            total: result[0].total
        });

    } catch (error) {

        console.error(
            "Total logins error:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });

    }

});
// =========================
// ADMIN LOGIN
// =========================

app.post("/api/admin/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        // Admin credentials
        const adminEmail = "NikhilGym@gmail.com";
        const adminPassword = "Gym@2026#";

        if (
            email !== adminEmail ||
            password !== adminPassword
        ) {

            return res.status(401).json({
                message: "Invalid admin email or password"
            });

        }

        res.json({
            message: "Admin login successful",
            admin: {
                email: adminEmail
            }
        });

    } catch (error) {

        console.error(
            "Admin login error:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });

    }

});
// =========================
// ADMIN - DELETE MEMBER
// =========================

app.delete("/api/admin/members/:id", async (req, res) => {

    try {

        const { id } = req.params;

        // पहले login history delete करें
        await db.execute(
            "DELETE FROM login_history WHERE user_id = ?",
            [id]
        );

        // फिर user delete करें
        const [result] = await db.execute(
            "DELETE FROM users WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "Member not found"
            });

        }

        res.json({
            message: "Member deleted successfully"
        });

    } catch (error) {

        console.error(
            "Delete member error:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });

    }

});

// Start server
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
// =========================
// ADMIN - GET ALL MEMBERS
// =========================

app.get("/api/admin/members", async (req, res) => {

    try {

        const [members] = await db.execute(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.created_at,
                MAX(l.login_time) AS last_login
            FROM users u
            LEFT JOIN login_history l
                ON u.id = l.user_id
            GROUP BY
                u.id,
                u.name,
                u.email,
                u.created_at
            ORDER BY u.id DESC
        `);

        res.json(members);

    } catch (error) {

        console.error(
            "Admin members error:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });

    }

});
