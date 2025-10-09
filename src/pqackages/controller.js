// src/packages/controller.js
const Package = require("./modal"); // ensure this points to src/packages/model.js

/* ---------------------------- Helpers / Coercers ---------------------------- */
function escapeRegex(s = "") {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMaybeJSON(value, fallback) {
    if (value === undefined) return fallback;
    if (Array.isArray(value) || (value && typeof value === "object")) return value;
    if (typeof value === "string") {
        const t = value.trim();
        if (!t) return fallback;
        try {
            return JSON.parse(t);
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
    if (v === undefined) return undefined; // don't touch on update
    if (v === null || String(v).trim() === "" || v === "null") return null;
    return String(v).trim();
}

function coerceDate(v) {
    if (v === undefined || v === null || v === "") return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
}

function clampStars(stars) {
    const n = Number(stars);
    if (!Number.isFinite(n)) return 5;
    return Math.min(5, Math.max(1, Math.round(n)));
}

const ALLOWED_STATUS = ["draft", "published"];
const ALLOWED_SLUGS = ["religious", "social", "news", "sports"];
const ALLOWED_CATEGORIES = [
    "Ramadan",
    "Quran",
    "Scholars",
    "Charity",
    "Education",
    "Iftar",
    "Initiative",
    "Youth",
    "Women",
    "Campaign",
    "Diaspora",
    "Volunteer",
    "Interfaith",
    "Platform Launch",
    "Award",
    "Production",
    "Expansion",
    "Digital",
    "Partnership",
    "Infrastructure",
    "Football",
    "Basketball",
    "Athletics",
    "Community",
    "Volleyball",
    "Festival",
];

/* ------------------------------ Slug utilities ----------------------------- */
async function findPackageBySlugInsensitive(slug) {
    if (!slug) return null;
    const cond = { slug: { $regex: `^${escapeRegex(String(slug).trim())}$`, $options: "i" } };
    return Package.findOne(cond).select("_id title slug").lean();
}

/* ----------------------------- Upload utilities ---------------------------- */
// Map multer file to URL
const fileToUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// For upload.fields; get a direct field if provided
const pickFile = (req, field) => {
    const arr = req?.files?.[field];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
};

// Match keys like "featuredStories.0.image"
function collectStoryImageUploads(req) {
    const out = new Map(); // key: index -> url
    const filesObj = req?.files || {};
    for (const key of Object.keys(filesObj)) {
        const m = key.match(/^featuredStories\.(\d+)\.image$/);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        const f = pickFile(req, key);
        if (Number.isInteger(idx) && f) out.set(idx, fileToUrl(f));
    }
    return out;
}

/* ---------------------------------- List ---------------------------------- */
exports.listPackages = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

        const q = coerceString(req.query.q);
        const status = coerceString(req.query.status);
        const slug = coerceString(req.query.slug);
        const category = coerceString(req.query.category);

        const filter = {};
        if (q) {
            const rx = { $regex: q, $options: "i" };
            filter.$or = [
                { title: rx },
                { description: rx },
                { "featuredStories.title": rx },
                { "featuredStories.description": rx },
                { "featuredStories.author": rx },
                { "featuredStories.fullVersion": rx },
            ];
        }
        if (status && ALLOWED_STATUS.includes(status)) filter.status = status;
        if (slug && ALLOWED_SLUGS.includes(slug)) filter.slug = slug;
        if (category && ALLOWED_CATEGORIES.includes(category)) filter.category = category;

        const sortKey = (req.query.sort || "createdAt").toString();
        const sort =
            sortKey === "title"
                ? { title: 1, createdAt: -1 }
                : sortKey === "updatedAt"
                    ? { updatedAt: -1 }
                    : { createdAt: -1 }; // default newest first

        const [items, total] = await Promise.all([
            Package.find(filter)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy", "name email"),
            Package.countDocuments(filter),
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
        res.status(500).json({ message: "Failed to fetch packages" });
    }
};

/* ---------------------------------- Get ----------------------------------- */
exports.getPackage = async (req, res) => {
    try {
        const item = await Package.findById(req.params.id).populate("createdBy", "name email");
        if (!item) return res.status(404).json({ message: "Package not found" });
        res.json({ status: "success", data: item });
    } catch {
        res.status(400).json({ message: "Invalid id" });
    }
};

/* -------------------------------- Create ---------------------------------- */
exports.createPackage = async (req, res) => {
    try {
        const body = req.body || {};

        const title = coerceString(body.title);
        const description = coerceString(body.description);
        const slug = coerceString(body.slug).toLowerCase();
        const category = coerceString(body.category);

        if (!title) return res.status(400).json({ message: "title is required" });
        if (!description) return res.status(400).json({ message: "description is required" });
        if (!slug) return res.status(400).json({ message: "slug is required" });
        if (!ALLOWED_SLUGS.includes(slug)) return res.status(400).json({ message: "Invalid slug" });
        if (category && !ALLOWED_CATEGORIES.includes(category))
            return res.status(400).json({ message: "Invalid category" });

        // Enforce: one document per slug (case-insensitive)
        const existing = await findPackageBySlugInsensitive(slug);
        if (existing) {
            return res.status(409).json({
                code: "PACKAGE_EXISTS",
                message: `A package for slug "${existing.slug}" already exists (title: "${existing.title}"). Only one document per slug is allowed.`,
                existingId: existing._id,
                existingSlug: existing.slug,
            });
        }

        const payload = {
            title,
            description,
            slug,
            status: ALLOWED_STATUS.includes(body.status) ? body.status : "draft",
            category: category || undefined,
            createdBy: req.user?._id || null,
        };

        // Featured stories: accept JSON or array; minimal normalization
        const rawFS = parseMaybeJSON(body.featuredStories, body.featuredStories);
        let featuredStories = Array.isArray(rawFS)
            ? rawFS.map((it) => ({
                image: it?.image === undefined ? null : coerceNullableString(it.image),
                title: coerceString(it?.title),
                description: coerceString(it?.description),
                author: coerceString(it?.author),
                date: coerceDate(it?.date),
                fullVersion: coerceString(it?.fullVersion),
            }))
            : [];

        // Remove invalid/empty entries (require title, description, author, fullVersion)
        featuredStories = featuredStories.filter(
            (it) => it.title && it.description && it.author && it.fullVersion && it.date instanceof Date
        );

        // Uploaded files can override specific story images by index
        const uploads = collectStoryImageUploads(req);
        if (uploads.size) {
            featuredStories = featuredStories.map((it, idx) => ({
                ...it,
                image: uploads.get(idx) ?? it.image ?? null,
            }));
        }

        payload.featuredStories = featuredStories;

        const item = await Package.create(payload);
        const populated = await item.populate([{ path: "createdBy", select: "name email" }]);

        res.status(201).json({ status: "success", data: populated });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Create failed" });
    }
};

/* -------------------------------- Update ---------------------------------- */
exports.updatePackage = async (req, res) => {
    try {
        const id = req.params.id;
        const current = await Package.findById(id).lean();
        if (!current) return res.status(404).json({ message: "Package not found" });

        const body = req.body || {};
        const update = {};

        // slug change?
        if (body.slug !== undefined) {
            const nextSlug = coerceString(body.slug).toLowerCase();
            if (!ALLOWED_SLUGS.includes(nextSlug)) return res.status(400).json({ message: "Invalid slug" });

            const existing = await findPackageBySlugInsensitive(nextSlug);
            if (existing && String(existing._id) !== String(current._id)) {
                return res.status(409).json({
                    code: "PACKAGE_EXISTS",
                    message: `A package for slug "${existing.slug}" already exists (title: "${existing.title}"). Only one document per slug is allowed.`,
                    existingId: existing._id,
                    existingSlug: existing.slug,
                });
            }
            update.slug = nextSlug;
        }

        if (body.title !== undefined) update.title = coerceString(body.title) || current.title;
        if (body.description !== undefined)
            update.description = coerceString(body.description) || current.description;

        if (body.status !== undefined)
            update.status = ALLOWED_STATUS.includes(body.status) ? body.status : current.status;

        if (body.category !== undefined) {
            const nextCat = coerceString(body.category);
            if (nextCat && !ALLOWED_CATEGORIES.includes(nextCat))
                return res.status(400).json({ message: "Invalid category" });
            update.category = nextCat || undefined;
        }

        // featuredStories (replace full array)
        if (body.featuredStories !== undefined) {
            const raw = parseMaybeJSON(body.featuredStories, body.featuredStories);
            let arr = Array.isArray(raw)
                ? raw.map((it) => ({
                    image: it?.image === undefined ? null : coerceNullableString(it.image),
                    title: coerceString(it?.title),
                    description: coerceString(it?.description),
                    author: coerceString(it?.author),
                    date: coerceDate(it?.date),
                    category: coerceString(it?.category),
                    fullVersion: coerceString(it?.fullVersion),
                }))
                : [];
            arr = arr.filter(
                (it) => it.title && it.description && it.category && it.author && it.fullVersion && it.date instanceof Date
            );

            // Allow uploaded images to override specific indices
            const uploads = collectStoryImageUploads(req);
            if (uploads.size) {
                arr = arr.map((it, idx) => ({
                    ...it,
                    image: uploads.get(idx) ?? it.image ?? null,
                }));
            }

            update.featuredStories = arr;
        } else {
            // Even when array isn't provided, we still accept uploaded images to patch existing indices
            const uploads = collectStoryImageUploads(req);
            if (uploads.size) {
                const existing = (await Package.findById(id).select("featuredStories")).toObject()
                    .featuredStories;
                const patched = existing.map((it, idx) => ({
                    ...it,
                    image: uploads.get(idx) ?? it.image ?? null,
                }));
                update.featuredStories = patched;
            }
        }

        const item = await Package.findByIdAndUpdate(id, update, {
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

/* -------------------------------- Delete ---------------------------------- */
exports.deletePackage = async (req, res) => {
    try {
        const item = await Package.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ message: "Package not found" });
        res.json({ message: "Deleted" });
    } catch {
        res.status(400).json({ message: "Delete failed" });
    }
};
