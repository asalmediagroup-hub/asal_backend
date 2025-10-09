const Category = require("./modal");

// GET /api/categories
exports.listCategories = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1"), 1);
        const limit = Math.min(parseInt(req.query.limit || "20"), 100);
        const q = (req.query.q || "").trim();
        const type = (req.query.type || "").trim();

        const filter = {};
        if (q) filter.name = { $regex: q, $options: "i" };
        if (type) filter.type = type;

        const [items, total] = await Promise.all([
            Category.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy", "name email"),
            Category.countDocuments(filter),
        ]);

        res.json({ status: "success", data: items, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ message: "Failed to fetch categories" });
    }
};

// GET /api/categories/:id
exports.getCategory = async (req, res) => {
    const item = await Category.findById(req.params.id).populate("createdBy", "name email");
    if (!item) return res.status(404).json({ message: "Category not found" });
    res.json({ status: "success", data: item });
};

// POST /api/categories
exports.createCategory = async (req, res) => {
    try {
        let { name, type } = req.body;
        if (!name) return res.status(400).json({ message: "name is required" });
        name = String(name).trim();
        type = (type || "service").trim();

        // Manual duplicate check (helpful for friendly 409)
        const exists = await Category.findOne({ name, type });
        if (exists) return res.status(409).json({ message: "Category with the same type and name already exists" });

        const item = await Category.create({
            name,
            type,
            createdBy: req.user?._id || null,
        });

        res.status(201).json({ status: "success", data: item });
    } catch (e) {
        if (e?.code === 11000) {
            return res.status(409).json({ message: "Category with the same type and name already exists" });
        }
        res.status(400).json({ message: "Create failed" });
    }
};

// PATCH /api/categories/:id
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const current = await Category.findById(id);
        if (!current) return res.status(404).json({ message: "Category not found" });

        const update = { ...req.body };
        if (update.name) update.name = String(update.name).trim();
        if (update.type) update.type = String(update.type).trim();

        // Compute the would-be values to check duplicates
        const newName = update.name ?? current.name;
        const newType = update.type ?? current.type;

        const duplicate = await Category.findOne({
            _id: { $ne: id },
            name: newName,
            type: newType,
        });
        if (duplicate) {
            return res.status(409).json({ message: "Another category with the same type and name already exists" });
        }

        const item = await Category.findByIdAndUpdate(
            id,
            update,
            { new: true, runValidators: true, context: "query" }
        ).populate("createdBy", "name email");

        res.json({ status: "success", data: item });
    } catch (e) {
        if (e?.code === 11000) {
            return res.status(409).json({ message: "Category with the same type and name already exists" });
        }
        res.status(400).json({ message: "Update failed" });
    }
};

// DELETE /api/categories/:id
exports.deleteCategory = async (req, res) => {
    const item = await Category.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Deleted" });
};
