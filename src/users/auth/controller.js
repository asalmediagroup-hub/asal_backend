const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../modal");

const sign = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || "1d" });

const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ message: "name, email and password are required" });

        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ message: "Email already in use" });

        const user = await User.create({ name, email, password });

        let token;
        try {
            if (!process.env.JWT_SECRET) {
                throw new Error("JWT_SECRET is not configured");
            }
            token = sign(user._id);
            res.cookie("token", token, cookieOpts);
        } catch (tokenErr) {
            // In development, expose why token could not be set
            if (process.env.NODE_ENV !== "production") {
                console.warn("Registration token warning:", tokenErr.message);
            }
        }

        res.status(201).json({ user, token });
    } catch (e) {
        if (process.env.NODE_ENV !== "production") {
            console.error("Registration error:", e);
            return res.status(500).json({ message: "Registration failed", error: e.message });
        }
        res.status(500).json({ message: "Registration failed" });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: "email and password are required" });

        const user = await User.findOne({ email }).select("+password");
        if (!user) return res.status(400).json({ message: "Invalid credentials" });

        const ok = await user.matchPassword(password);
        if (!ok) return res.status(400).json({ message: "Invalid credentials" });

        let token;
        try {
            if (!process.env.JWT_SECRET) {
                throw new Error("JWT_SECRET is not configured");
            }
            token = sign(user._id);
            res.cookie("token", token, cookieOpts);
        } catch (tokenErr) {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Login token warning:", tokenErr.message);
            }
        }

        res.json({ user: user.toJSON(), token });
    } catch (e) {
        if (process.env.NODE_ENV !== "production") {
            console.error("Login error:", e);
            return res.status(500).json({ message: "Login failed", error: e.message });
        }
        res.status(500).json({ message: "Login failed" });
    }
};

exports.me = (req, res) => res.json({ user: req.user });
