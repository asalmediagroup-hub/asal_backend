// src/home/controller.js
const Home = require("./modal");

/* ------------------------- Helpers ------------------------- */
function parseMaybeJSON(value, fallback) {
    if (value === undefined) return fallback;
    if (Array.isArray(value) || typeof value === "object") return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return fallback;
        try {
            return JSON.parse(trimmed);
        } catch {
            return fallback;
        }
    }
    return fallback;
}

function coerceString(v, def = "") {
    if (v === undefined || v === null) return def;
    return String(v).trim();
}

function coerceNullableString(v) {
    if (v === undefined) return undefined;
    if (v === null || String(v).trim() === "" || v === "null") return null;
    return String(v).trim();
}

// Map multer file to URL
const fileToUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// Get first file by field name from req.files (upload.fields)
const pickFile = (req, field) => {
    const arr = req?.files?.[field];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
};

// Get all files by field name from req.files (upload.fields)
const pickFiles = (req, field) => {
    const arr = req?.files?.[field];
    return Array.isArray(arr) ? arr.map(fileToUrl) : [];
};

/* ------------------------------- List ------------------------------- */
exports.listHomes = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

        const q = coerceString(req.query.q);
        const sortKey = (req.query.sort || "createdAt").toString();

        const filter = {};
        if (q) {
            filter.$or = [
                { siteName: { $regex: q, $options: "i" } },
                { title: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
                { hero: { $regex: q, $options: "i" } },
            ];
        }

        const sort =
            sortKey === "updatedAt"
                ? { updatedAt: -1 }
                : sortKey === "createdAt"
                    ? { createdAt: -1 }
                    : { createdAt: -1 };

        const [items, total] = await Promise.all([
            Home.find(filter)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy", "name email"),
            Home.countDocuments(filter),
        ]);

        res.json({
            status: "success",
            data: items,
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Failed to fetch home data" });
    }
};

/* -------------------------------- Get -------------------------------- */
exports.getHome = async (req, res) => {
    try {
        const item = await Home.findById(req.params.id).populate("createdBy", "name email");
        if (!item) return res.status(404).json({ message: "Home data not found" });
        res.json({ status: "success", data: item });
    } catch {
        res.status(400).json({ message: "Invalid id" });
    }
};

/* ------------------------- Create (upload-aware) ------------------------- */
exports.createHome = async (req, res) => {
    try {
        // ---------- Singleton guard ----------
        const existing = await Home.findOne().select("_id siteName").lean();
        if (existing) {
            return res.status(409).json({
                code: "HOME_EXISTS",
                message: "Home page data already exists",
                existingId: existing._id,
                existingSiteName: existing.siteName || "",
            });
        }

        const body = req.body || {};

        // Required field validation
        const siteName = coerceString(body.siteName);
        const title = coerceString(body.title);
        const description = coerceString(body.description);

        if (!siteName) return res.status(400).json({ message: "siteName is required" });
        if (!title) return res.status(400).json({ message: "title is required" });
        if (!description) return res.status(400).json({ message: "description is required" });

        // Hero handling: can be image file upload, image URL, or video URL
        const heroImageFile = pickFile(req, "heroImage");
        const heroUrl = coerceString(body.hero);

        let hero = null;
        if (heroImageFile) {
            // Image file uploaded
            hero = fileToUrl(heroImageFile);
        } else if (heroUrl) {
            // URL provided (could be image or video URL)
            hero = heroUrl;
        } else {
            return res.status(400).json({ message: "hero is required (either heroImage file upload or hero URL string)" });
        }

        // Core
        const payload = {
            siteName,
            hero,
            title,
            description,
            createdBy: req.user?._id || null,
        };

        // Logo image handling
        const logoFile = pickFile(req, "logoImage");
        if (logoFile) {
            payload.logoImage = fileToUrl(logoFile);
        } else {
            const logoImg = coerceNullableString(body.logoImage);
            if (logoImg !== undefined) {
                payload.logoImage = logoImg;
            } else {
                return res.status(400).json({ message: "logoImage is required" });
            }
        }

        // Brands preview images (must be exactly 4)
        const brandsFiles = pickFiles(req, "brandsPreviewImage");
        const rawBrandsImages = parseMaybeJSON(body.brandsPreviewImage, body.brandsPreviewImage);

        let brandsImages = [];
        if (brandsFiles.length > 0) {
            brandsImages = brandsFiles;
        } else if (Array.isArray(rawBrandsImages)) {
            brandsImages = rawBrandsImages.map(img => coerceString(img)).filter(Boolean);
        }

        if (brandsImages.length !== 4) {
            return res.status(400).json({ message: "brandsPreviewImage must contain exactly 4 images" });
        }
        payload.brandsPreviewImage = brandsImages;

        // Services preview (must be exactly 4)
        const rawServices = parseMaybeJSON(body.servicesPreview, body.servicesPreview);
        if (!Array.isArray(rawServices) || rawServices.length !== 4) {
            return res.status(400).json({ message: "servicesPreview must contain exactly 4 services" });
        }

        payload.servicesPreview = rawServices
            .map((service) => ({
                title: coerceString(service?.title),
                description: coerceString(service?.description),
                keyServices: Array.isArray(service?.keyServices)
                    ? service.keyServices.map((s) => coerceString(s)).filter(Boolean)
                    : typeof service?.keyServices === "string"
                        ? service.keyServices.split(",").map((s) => coerceString(s)).filter(Boolean)
                        : [],
            }))
            .filter((service) => service.title && service.description);

        if (payload.servicesPreview.length !== 4) {
            return res.status(400).json({
                message: "servicesPreview must contain exactly 4 services with title and description",
            });
        }

        const created = await Home.create(payload);
        const populated = await created.populate([{ path: "createdBy", select: "name email" }]);

        res.status(201).json({ status: "success", data: populated });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Create failed" });
    }
};

/* ------------------------- Update (upload-aware) ------------------------- */
exports.updateHome = async (req, res) => {
    try {
        const id = req.params.id;
        const current = await Home.findById(id).lean();
        if (!current) return res.status(404).json({ message: "Home data not found" });

        const body = req.body || {};
        const update = {};

        if (body.siteName !== undefined) update.siteName = coerceString(body.siteName);
        if (body.title !== undefined) update.title = coerceString(body.title);
        if (body.description !== undefined) update.description = coerceString(body.description);

        // Hero handling: can be image file upload, image URL, or video URL
        const heroImageFile = pickFile(req, "heroImage");
        if (heroImageFile) {
            // Image file uploaded
            update.hero = fileToUrl(heroImageFile);
        } else if (body.hero !== undefined) {
            // URL provided (could be image or video URL)
            update.hero = coerceString(body.hero);
        }

        // Logo image handling
        const logoFile = pickFile(req, "logoImage");
        if (logoFile) {
            update.logoImage = fileToUrl(logoFile);
        } else if (body.logoImage !== undefined) {
            update.logoImage = coerceNullableString(body.logoImage);
        }

        // Brands preview images
        if (body.brandsPreviewImage !== undefined) {
            const brandsFiles = pickFiles(req, "brandsPreviewImage");
            const rawBrandsImages = parseMaybeJSON(body.brandsPreviewImage, body.brandsPreviewImage);

            let brandsImages = [];
            if (brandsFiles.length > 0) {
                brandsImages = brandsFiles;
            } else if (Array.isArray(rawBrandsImages)) {
                brandsImages = rawBrandsImages.map((img) => coerceString(img)).filter(Boolean);
            }

            if (brandsImages.length !== 4) {
                return res.status(400).json({ message: "brandsPreviewImage must contain exactly 4 images" });
            }
            update.brandsPreviewImage = brandsImages;
        } else {
            // Check if files were uploaded for existing images
            const brandsFiles = pickFiles(req, "brandsPreviewImage");
            if (brandsFiles.length > 0) {
                // Merge uploaded files with existing images
                const existing = current.brandsPreviewImage || [];
                const merged = brandsFiles.slice(0, 4).concat(existing.slice(brandsFiles.length));
                update.brandsPreviewImage = merged.slice(0, 4);
            }
        }

        // Services preview
        if (body.servicesPreview !== undefined) {
            const rawServices = parseMaybeJSON(body.servicesPreview, body.servicesPreview);
            if (!Array.isArray(rawServices) || rawServices.length !== 4) {
                return res.status(400).json({ message: "servicesPreview must contain exactly 4 services" });
            }

            const services = rawServices
                .map((service) => ({
                    title: coerceString(service?.title),
                    description: coerceString(service?.description),
                    keyServices: Array.isArray(service?.keyServices)
                        ? service.keyServices.map((s) => coerceString(s)).filter(Boolean)
                        : typeof service?.keyServices === "string"
                            ? service.keyServices.split(",").map((s) => coerceString(s)).filter(Boolean)
                            : [],
                }))
                .filter((service) => service.title && service.description);

            if (services.length !== 4) {
                return res.status(400).json({
                    message: "servicesPreview must contain exactly 4 services with title and description",
                });
            }

            update.servicesPreview = services;
        }

        const item = await Home.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            context: "query",
        }).populate("createdBy", "name email");

        res.json({ status: "success", data: item });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Update failed" });
    }
};

/* -------------------------------- Delete -------------------------------- */
exports.deleteHome = async (req, res) => {
    try {
        const item = await Home.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ message: "Home data not found" });
        res.json({ message: "Deleted" });
    } catch {
        res.status(400).json({ message: "Delete failed" });
    }
};