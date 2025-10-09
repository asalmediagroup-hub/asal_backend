// src/partnersReviews/controller.js
const PartnersReview = require("./modal");

// ---------- Helpers ----------
function escapeRegex(s = "") {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    if (v === undefined) return undefined; // do not touch on update
    if (v === null || String(v).trim() === "" || v === "null") return null;
    return String(v).trim();
}

function clampStarsNo(stars) {
    const n = Number(stars);
    if (!Number.isFinite(n)) return 5;
    // Int 1..5
    return Math.min(5, Math.max(1, Math.round(n)));
}

const ALLOWED_STATUS = ["draft", "published"];

// Map multer file to URL (extend as needed)
const fileToUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// Get first file by field name from req.files (upload.fields)
const pickFile = (req, field) => {
    const arr = req?.files?.[field];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
};

// ---------- List ----------
exports.listPartnersReviews = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

        const q = coerceString(req.query.q);
        const status = coerceString(req.query.status);

        const filter = {};
        if (q) {
            const regex = { $regex: q, $options: "i" };
            filter.$or = [
                { title: regex },
                { description: regex },
                { "items.message": regex },
                { "items.authorName": regex },
                { "items.title": regex },
            ];
        }
        if (status && ALLOWED_STATUS.includes(status)) filter.status = status;

        const sortKey = (req.query.sort || "createdAt").toString();
        // default newest first
        const sort =
            sortKey === "createdAt" ? { createdAt: -1 } : { createdAt: -1 };

        const [items, total] = await Promise.all([
            PartnersReview.find(filter)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy", "name email"),
            PartnersReview.countDocuments(filter),
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
        res.status(500).json({ message: "Failed to fetch partners reviews" });
    }
};

// ---------- Get ----------
exports.getPartnersReview = async (req, res) => {
    try {
        const item = await PartnersReview.findById(req.params.id).populate(
            "createdBy",
            "name email"
        );
        if (!item) return res.status(404).json({ message: "Partners review not found" });
        res.json({ status: "success", data: item });
    } catch {
        res.status(400).json({ message: "Invalid id" });
    }
};

// ---------- Create (upload-aware placeholder) ----------
exports.createPartnersReview = async (req, res) => {
    try {
        const body = req.body || {};

        // Core
        const payload = {
            title: coerceString(body.title),
            description: coerceString(body.description),
            status: ALLOWED_STATUS.includes(body.status) ? body.status : "draft",
            createdBy: req.user?._id, // required by schema
        };

        if (!payload.title) {
            return res.status(400).json({ message: "title is required" });
        }
        if (!payload.createdBy) {
            return res.status(401).json({ message: "Unauthorized (createdBy missing)" });
        }

        // Items array (supports JSON strings or arrays)
        const rawItems = parseMaybeJSON(body.items, body.items);
        payload.items = Array.isArray(rawItems)
            ? rawItems
                .map((it) => ({
                    image:
                        it?.image === undefined ? null : coerceNullableString(it.image),
                    title: coerceString(it?.title),
                    message: coerceString(it?.message),
                    authorName: coerceString(it?.authorName),
                    starsNo: clampStarsNo(it?.starsNo),
                }))
                .filter((it) => it.message && it.authorName && it.starsNo >= 1)
            : [];

        // ---------- Uploaded files hook (optional) ----------
        // If you later send a single top-level file (e.g., a banner), use:
        // const fBanner = pickFile(req, "bannerImage");
        // if (fBanner) payload.bannerImage = fileToUrl(fBanner);

        const item = await PartnersReview.create(payload);
        const populated = await item.populate([{ path: "createdBy", select: "name email" }]);

        res.status(201).json({ status: "success", data: populated });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Create failed" });
    }
};

// ---------- Update (upload-aware placeholder) ----------
exports.updatePartnersReview = async (req, res) => {
    try {
        const id = req.params.id;
        const current = await PartnersReview.findById(id).lean();
        if (!current) return res.status(404).json({ message: "Partners review not found" });

        const body = req.body || {};
        const update = {};

        if (body.title !== undefined) update.title = coerceString(body.title);
        if (body.description !== undefined)
            update.description = coerceString(body.description);
        if (body.status !== undefined)
            update.status = ALLOWED_STATUS.includes(body.status)
                ? body.status
                : current.status;

        // Items
        if (body.items !== undefined) {
            const raw = parseMaybeJSON(body.items, body.items);
            update.items = Array.isArray(raw)
                ? raw
                    .map((it) => ({
                        image:
                            it?.image === undefined ? null : coerceNullableString(it.image),
                        title: coerceString(it?.title),
                        message: coerceString(it?.message),
                        authorName: coerceString(it?.authorName),
                        starsNo: clampStarsNo(it?.starsNo),
                    }))
                    .filter((it) => it.message && it.authorName && it.starsNo >= 1)
                : [];
        }

        // ---------- Uploaded files hook (optional) ----------
        // e.g. const fBanner = pickFile(req, "bannerImage");
        // if (fBanner) update.bannerImage = fileToUrl(fBanner);

        const item = await PartnersReview.findByIdAndUpdate(id, update, {
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

// ---------- Delete ----------
exports.deletePartnersReview = async (req, res) => {
    try {
        const item = await PartnersReview.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ message: "Partners review not found" });
        res.json({ message: "Deleted" });
    } catch {
        res.status(400).json({ message: "Delete failed" });
    }
};
