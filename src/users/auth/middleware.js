const jwt = require("jsonwebtoken");
const User = require("../modal");

exports.protect = async (req, res, next) => {
    try {
        let token;

        // Prefer cookie, fallback to Authorization header
        if (req.cookies?.token) token = req.cookies.token;
        if (!token && req.headers.authorization?.startsWith("Bearer "))
            token = req.headers.authorization.split(" ")[1];
        if (!token)
            return res.status(401).json({ message: "Authentication required: token missing (cookie or Bearer header)." });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).populate("role");
        if (!user) return res.status(401).json({ message: "Authentication failed: user associated with token was not found." });

        req.user = user; // attach
        next();
    } catch (err) {
        res.status(401).json({ message: "Authentication failed: token invalid or expired." });
    }
};

exports.authorize = (...allowedRoleNames) => (req, res, next) => {
    const userRoleName = req.user?.role?.name;
    if (!userRoleName)
        return res.status(403).json({
            message: "Authorization failed: user has no role assigned.",
        });
    if (!allowedRoleNames.includes(userRoleName))
        return res.status(403).json({
            message: `Authorization failed: role '${userRoleName}' is not permitted.`,
            requiredRoles: allowedRoleNames,
        });
    next();
};

// permit checks role permissions for a specific subject/action
exports.permit = (subject, action) => (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(403).json({ message: "Authorization failed: user has no role assigned." });

    const permissions = Array.isArray(role.permissions) ? role.permissions : [];

    // Global manage grants access to everything
    const hasGlobalManage = permissions.some(
        (p) => p.subject === "all" && Array.isArray(p.actions) && p.actions.includes("manage")
    );
    if (hasGlobalManage) return next();

    // Subject-level manage grants access to all actions of that subject
    const hasSubjectManage = permissions.some(
        (p) => p.subject === subject && Array.isArray(p.actions) && p.actions.includes("manage")
    );
    if (hasSubjectManage) return next();

    // Otherwise, require explicit action on subject
    const hasExplicit = permissions.some(
        (p) => p.subject === subject && Array.isArray(p.actions) && p.actions.includes(action)
    );
    if (!hasExplicit)
        return res.status(403).json({
            message: "Permission denied:",
            required: { subject, action },
            role: role.name,
        });
    next();
};

// guard: single middleware to check token (presence/validity) and permissions
// Derives subject from baseUrl (e.g., /api/users -> users) and action from HTTP method
exports.guard = async (req, res, next) => {
    try {
        // 1) Token presence
        let token;
        if (req.cookies?.token) token = req.cookies.token;
        if (!token && req.headers.authorization?.startsWith("Bearer "))
            token = req.headers.authorization.split(" ")[1];
        if (!token)
            return res.status(401).json({ message: "Authentication required: token missing (cookie or Bearer header)." });

        // 2) Token validity and user
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (_err) {
            return res.status(401).json({ message: "Authentication failed: token invalid or expired." });
        }
        const user = await User.findById(decoded.id).populate("role");
        if (!user)
            return res.status(401).json({ message: "Authentication failed: user associated with token was not found." });
        req.user = user;

        // 3) Permission check
        const deriveSubject = () => {
            const parts = (req.baseUrl || "").split("/").filter(Boolean);
            const raw = (parts[parts.length - 1] || "").toLowerCase();
            if (raw === "user") return "users";
            if (raw === "role") return "roles";
            if (raw === "category") return "categories";
            if (raw === "service") return "services";
            if (raw === "brand") return "brands";
            if (raw === "role") return "roles";
            if (raw === "brand") return "brands";
            if (raw === "home") return "home";
            if (raw === "about") return "about";
            if (raw === "contact") return "contacts";
            if (raw === "product") return "products";
            return raw || "";
        };
        const deriveAction = () => {
            switch (req.method) {
                case "GET":
                    return "read";
                case "POST":
                    return "create";
                case "PUT":
                case "PATCH":
                    return "update";
                case "DELETE":
                    return "delete";
                default:
                    return "read";
            }
        };
        const subject = deriveSubject();
        const action = deriveAction();

        const role = req.user?.role;
        if (!role) return res.status(403).json({ message: "Authorization failed: user has no role assigned." });
        const permissions = Array.isArray(role.permissions) ? role.permissions : [];

        const hasGlobalManage = permissions.some(
            (p) => p.subject === "all" && Array.isArray(p.actions) && p.actions.includes("manage")
        );
        if (hasGlobalManage) return next();

        const hasSubjectManage = permissions.some(
            (p) => p.subject === subject && Array.isArray(p.actions) && p.actions.includes("manage")
        );
        if (hasSubjectManage) return next();

        const hasExplicit = permissions.some(
            (p) => p.subject === subject && Array.isArray(p.actions) && p.actions.includes(action)
        );
        if (!hasExplicit)
            return res.status(403).json({
                message: `Permission denied: you don't have permission to ${action} ${subject}`,
            });

        next();
    } catch (err) {
        res.status(500).json({ message: "Authorization guard failed", error: process.env.NODE_ENV !== "production" ? err.message : undefined });
    }
};
