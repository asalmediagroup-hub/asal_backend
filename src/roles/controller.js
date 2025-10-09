const Role = require("./modal");

exports.listRoles = async (_req, res) => {
    try {
        const items = await Role.find().sort({ createdAt: -1 }).populate("createdBy", "name email");
        res.json({ status: "success", data: items });
    } catch (e) {
        res.status(500).json({ message: "Failed to fetch roles" });
    }
};

exports.getRole = async (req, res) => {
    const item = await Role.findById(req.params.id).populate("createdBy", "name email");
    if (!item) return res.status(404).json({ message: "Role not found" });
    res.json({ status: "success", data: item });
};

exports.createRole = async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        if (!name) return res.status(400).json({ message: "name is required" });
        const exists = await Role.findOne({ name });
        if (exists) return res.status(409).json({ message: "Role name already exists" });
        const normalizedPermissions = Array.isArray(permissions)
            ? permissions.map((p) => {
                const subject = String(p.subject || "").trim();
                const raw = p.actions !== undefined ? p.actions : p.action;
                const actions = Array.isArray(raw) ? raw : raw ? [raw] : [];
                return { subject, actions };
            })
            : [];
        const item = await Role.create({ name, description, permissions: normalizedPermissions, createdBy: req.user?._id || null });
        res.status(201).json({ status: "success", data: item });
    } catch (e) {
        res.status(400).json({ message: "Create failed" });
    }
};

exports.updateRole = async (req, res) => {
    try {
        const update = { ...req.body };
        if (update.name) {
            const exists = await Role.findOne({ name: update.name, _id: { $ne: req.params.id } });
            if (exists) return res.status(409).json({ message: "Role name already exists" });
        }
        if (update.permissions) {
            update.permissions = Array.isArray(update.permissions)
                ? update.permissions.map((p) => {
                    const subject = String(p.subject || "").trim();
                    const raw = p.actions !== undefined ? p.actions : p.action;
                    const actions = Array.isArray(raw) ? raw : raw ? [raw] : [];
                    return { subject, actions };
                })
                : [];
        }
        const item = await Role.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate("createdBy", "name email");
        if (!item) return res.status(404).json({ message: "Role not found" });
        res.json({ item });
    } catch (e) {
        res.status(400).json({ message: "Update failed" });
    }
};

exports.deleteRole = async (req, res) => {
    const item = await Role.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Role not found" });
    res.json({ message: "Deleted" });
};


