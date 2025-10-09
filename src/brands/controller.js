// src/brands/controller.js
const Brand = require("./modal");

// ---------- Helpers ----------
function escapeRegex(s = "") {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureUniqueSlug({ slug, excludeId = null }) {
    if (!slug) return false;
    const cond = {
        slug: { $regex: `^${escapeRegex(String(slug).trim())}$`, $options: "i" },
    };
    if (excludeId) cond._id = { $ne: excludeId };
    const exists = await Brand.findOne(cond).lean();
    return !!exists;
}

// friendlier duplicate helpers
function toTitleCaseFromSlug(s = "") {
    return String(s)
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

async function findBrandBySlugInsensitive(slug) {
    const cond = {
        slug: { $regex: `^${escapeRegex(String(slug).trim())}$`, $options: "i" },
    };
    return Brand.findOne(cond).select("_id name slug").lean();
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

function coerceNumber(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function clampStars(stars) {
    const n = Number(stars);
    if (!Number.isFinite(n)) return 5;
    return Math.min(5, Math.max(1, Math.round(n)));
}

const ALLOWED_SLUGS = ["asal-tv", "jiil-media", "masrax-production", "nasiye"];
const ALLOWED_STATUS = ["draft", "published"];

// Map multer file to URL
const fileToUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// Get first file by field name from req.files (upload.fields)
const pickFile = (req, field) => {
    const arr = req?.files?.[field];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
};

// ---------- List ----------
exports.listBrands = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

        const q = coerceString(req.query.q);
        const status = coerceString(req.query.status);
        const slug = coerceString(req.query.slug);

        const filter = {};
        if (q) {
            filter.$or = [
                { name: { $regex: q, $options: "i" } },
                { heroTitle: { $regex: q, $options: "i" } },
                { aboutTitle: { $regex: q, $options: "i" } },
                { featuredDescription: { $regex: q, $options: "i" } },
                { platformFeaturesDescription: { $regex: q, $options: "i" } },
                { contentCategoriesDescription: { $regex: q, $options: "i" } },
                { reviewsTitle: { $regex: q, $options: "i" } },
            ];
        }
        if (status && ALLOWED_STATUS.includes(status)) filter.status = status;
        if (slug) filter.slug = slug;

        const sortKey = (req.query.sort || "order").toString();
        const sort = sortKey === "createdAt" ? { createdAt: -1 } : { order: 1, createdAt: -1 };

        const [items, total] = await Promise.all([
            Brand.find(filter)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy", "name email"),
            Brand.countDocuments(filter),
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
        res.status(500).json({ message: "Failed to fetch brands" });
    }
};

// ---------- Get ----------
exports.getBrand = async (req, res) => {
    try {
        const item = await Brand.findById(req.params.id).populate("createdBy", "name email");
        if (!item) return res.status(404).json({ message: "Brand not found" });
        res.json({ status: "success", data: item });
    } catch {
        res.status(400).json({ message: "Invalid id" });
    }
};

// ---------- Create (upload-aware) ----------
exports.createBrand = async (req, res) => {
    try {
        const body = req.body || {};
        const name = coerceString(body.name);
        const slug = coerceString(body.slug).toLowerCase();

        if (!name) return res.status(400).json({ message: "name is required" });
        if (!slug) return res.status(400).json({ message: "slug is required" });
        if (!ALLOWED_SLUGS.includes(slug))
            return res.status(400).json({ message: "Invalid slug" });

        // friendlier duplicate check (case-insensitive)
        const existing = await findBrandBySlugInsensitive(slug);
        if (existing) {
            const pretty = existing.name || toTitleCaseFromSlug(existing.slug || slug);
            return res.status(409).json({
                code: "BRAND_EXISTS",
                message: `${pretty} already exists. Please use Edit to update the existing brand.`,
                existingId: existing._id,
                existingSlug: existing.slug,
                existingName: existing.name || pretty,
            });
        }

        // Core
        const payload = {
            name,
            slug,
            status: ALLOWED_STATUS.includes(body.status) ? body.status : "draft",
            order: coerceNumber(body.order, 0),
            themeKey: coerceString(body.themeKey || "primary"),
            createdBy: req.user?._id || null,
        };

        // Hero (strings first)
        payload.heroTitle = coerceString(body.heroTitle);
        payload.heroDescription = coerceString(body.heroDescription);
        payload.heroBgImage = coerceNullableString(body.heroBgImage) ?? null;
        payload.heroBgImageMobile = coerceNullableString(body.heroBgImageMobile) ?? null;

        // About
        payload.aboutTitle = coerceString(body.aboutTitle);
        payload.aboutDescription = coerceString(body.aboutDescription);
        payload.aboutImage = coerceNullableString(body.aboutImage) ?? null;

        // Screenshot (Nasiye)
        payload.screenshotTitle = coerceString(body.screenshotTitle);
        payload.screenshotImage = coerceNullableString(body.screenshotImage) ?? null;

        // Featured (array of { image, title, description, href, order })
        payload.featuredDescription = coerceString(body.featuredDescription);
        const rawFeatured = parseMaybeJSON(body.featuredItems, body.featuredItems);
        payload.featuredItems = Array.isArray(rawFeatured)
            ? rawFeatured
                .map((it) => ({
                    image: it?.image === undefined ? null : coerceNullableString(it.image),
                    title: coerceString(it?.title),
                    description: coerceString(it?.description),
                    href: coerceString(it?.href || "#") || "#",
                    order: coerceNumber(it?.order, 0),
                }))
                .filter((it) => it.title)
            : [];

        // Platform features (Nasiye)
        payload.platformFeaturesDescription = coerceString(body.platformFeaturesDescription);
        const rawPF = parseMaybeJSON(body.platformFeatures, body.platformFeatures);
        payload.platformFeatures = Array.isArray(rawPF)
            ? rawPF
                .map((it) => ({
                    image: it?.image === undefined ? null : coerceNullableString(it.image),
                    title: coerceString(it?.title),
                    description: coerceString(it?.description),
                }))
                .filter((it) => it.title)
            : [];

        // Content categories (Nasiye)
        payload.contentCategoriesDescription = coerceString(body.contentCategoriesDescription);
        const rawCats = parseMaybeJSON(body.contentCategories, body.contentCategories);
        payload.contentCategories = Array.isArray(rawCats)
            ? rawCats
                .map((it) => ({
                    title: coerceString(it?.title),
                    subtitle: coerceString(it?.subtitle),
                }))
                .filter((it) => it.title)
            : [];

        // Reviews (Nasiye)
        payload.reviewsTitle = coerceString(body.reviewsTitle);
        const rawReviews = parseMaybeJSON(body.userReviews, body.userReviews);
        payload.userReviews = Array.isArray(rawReviews)
            ? rawReviews
                .map((it) => ({
                    stars: clampStars(it?.stars),
                    message: coerceString(it?.message),
                    person: coerceString(it?.person),
                }))
                .filter((it) => it.message && it.person)
            : [];

        // ---------- Uploaded files override string values ----------
        // Expecting upload.fields([...]) with these field names:
        // heroBgImage, heroBgImageMobile, aboutImage, screenshotImage
        const fHero = pickFile(req, "heroBgImage");
        const fHeroMobile = pickFile(req, "heroBgImageMobile");
        const fAbout = pickFile(req, "aboutImage");
        const fShot = pickFile(req, "screenshotImage");

        if (fHero) payload.heroBgImage = fileToUrl(fHero);
        if (fHeroMobile) payload.heroBgImageMobile = fileToUrl(fHeroMobile);
        if (fAbout) payload.aboutImage = fileToUrl(fAbout);
        if (fShot) payload.screenshotImage = fileToUrl(fShot);

        const item = await Brand.create(payload);
        const populated = await item.populate([{ path: "createdBy", select: "name email" }]);

        res.status(201).json({ status: "success", data: populated });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Create failed" });
    }
};

// ---------- Update (upload-aware) ----------
exports.updateBrand = async (req, res) => {
    try {
        const id = req.params.id;
        const current = await Brand.findById(id).lean();
        if (!current) return res.status(404).json({ message: "Brand not found" });

        const body = req.body || {};
        const update = {};

        // slug change?
        if (body.slug !== undefined) {
            const nextSlug = coerceString(body.slug).toLowerCase();
            if (!ALLOWED_SLUGS.includes(nextSlug))
                return res.status(400).json({ message: "Invalid slug" });

            // friendlier duplicate on update too
            const existing = await findBrandBySlugInsensitive(nextSlug);
            if (existing && String(existing._id) !== String(current._id)) {
                const pretty = existing.name || toTitleCaseFromSlug(existing.slug || nextSlug);
                return res.status(409).json({
                    code: "BRAND_EXISTS",
                    message: `${pretty} already exists. Please pick a different slug or edit the existing brand.`,
                    existingId: existing._id,
                    existingSlug: existing.slug,
                    existingName: existing.name || pretty,
                });
            }
            update.slug = nextSlug;
        }

        if (body.name !== undefined) update.name = coerceString(body.name);
        if (body.status !== undefined)
            update.status = ALLOWED_STATUS.includes(body.status) ? body.status : current.status;
        if (body.order !== undefined) update.order = coerceNumber(body.order, current.order);
        if (body.themeKey !== undefined)
            update.themeKey = coerceString(body.themeKey || current.themeKey);

        // Hero
        if (body.heroTitle !== undefined) update.heroTitle = coerceString(body.heroTitle);
        if (body.heroDescription !== undefined)
            update.heroDescription = coerceString(body.heroDescription);
        if (body.heroBgImage !== undefined)
            update.heroBgImage = coerceNullableString(body.heroBgImage);
        if (body.heroBgImageMobile !== undefined)
            update.heroBgImageMobile = coerceNullableString(body.heroBgImageMobile);

        // About
        if (body.aboutTitle !== undefined) update.aboutTitle = coerceString(body.aboutTitle);
        if (body.aboutDescription !== undefined)
            update.aboutDescription = coerceString(body.aboutDescription);
        if (body.aboutImage !== undefined) update.aboutImage = coerceNullableString(body.aboutImage);

        // Screenshot
        if (body.screenshotTitle !== undefined)
            update.screenshotTitle = coerceString(body.screenshotTitle);
        if (body.screenshotImage !== undefined)
            update.screenshotImage = coerceNullableString(body.screenshotImage);

        // Featured
        if (body.featuredDescription !== undefined)
            update.featuredDescription = coerceString(body.featuredDescription);

        if (body.featuredItems !== undefined) {
            const raw = parseMaybeJSON(body.featuredItems, body.featuredItems);
            update.featuredItems = Array.isArray(raw)
                ? raw
                    .map((it) => ({
                        image: it?.image === undefined ? null : coerceNullableString(it.image),
                        title: coerceString(it?.title),
                        description: coerceString(it?.description),
                        href: coerceString(it?.href || "#") || "#",
                        order: coerceNumber(it?.order, 0),
                    }))
                    .filter((it) => it.title)
                : [];
        }

        // Platform features (Nasiye)
        if (body.platformFeaturesDescription !== undefined)
            update.platformFeaturesDescription = coerceString(body.platformFeaturesDescription);

        if (body.platformFeatures !== undefined) {
            const raw = parseMaybeJSON(body.platformFeatures, body.platformFeatures);
            update.platformFeatures = Array.isArray(raw)
                ? raw
                    .map((it) => ({
                        image: it?.image === undefined ? null : coerceNullableString(it.image),
                        title: coerceString(it?.title),
                        description: coerceString(it?.description),
                    }))
                    .filter((it) => it.title)
                : [];
        }

        // Content categories (Nasiye)
        if (body.contentCategoriesDescription !== undefined)
            update.contentCategoriesDescription = coerceString(body.contentCategoriesDescription);

        if (body.contentCategories !== undefined) {
            const raw = parseMaybeJSON(body.contentCategories, body.contentCategories);
            update.contentCategories = Array.isArray(raw)
                ? raw
                    .map((it) => ({
                        title: coerceString(it?.title),
                        subtitle: coerceString(it?.subtitle),
                    }))
                    .filter((it) => it.title)
                : [];
        }

        // Reviews (Nasiye)
        if (body.reviewsTitle !== undefined) update.reviewsTitle = coerceString(body.reviewsTitle);

        if (body.userReviews !== undefined) {
            const raw = parseMaybeJSON(body.userReviews, body.userReviews);
            update.userReviews = Array.isArray(raw)
                ? raw
                    .map((it) => ({
                        stars: clampStars(it?.stars),
                        message: coerceString(it?.message),
                        person: coerceString(it?.person),
                    }))
                    .filter((it) => it.message && it.person)
                : [];
        }

        // ---------- Uploaded files override (if provided) ----------
        // Expecting upload.fields([...]) with:
        // heroBgImage, heroBgImageMobile, aboutImage, screenshotImage
        const fHero = pickFile(req, "heroBgImage");
        const fHeroMobile = pickFile(req, "heroBgImageMobile");
        const fAbout = pickFile(req, "aboutImage");
        const fShot = pickFile(req, "screenshotImage");

        if (fHero) update.heroBgImage = fileToUrl(fHero);
        if (fHeroMobile) update.heroBgImageMobile = fileToUrl(fHeroMobile);
        if (fAbout) update.aboutImage = fileToUrl(fAbout);
        if (fShot) update.screenshotImage = fileToUrl(fShot);

        const item = await Brand.findByIdAndUpdate(id, update, {
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
exports.deleteBrand = async (req, res) => {
    try {
        const item = await Brand.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ message: "Brand not found" });
        res.json({ message: "Deleted" });
    } catch {
        res.status(400).json({ message: "Delete failed" });
    }
};
