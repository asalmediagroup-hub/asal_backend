// src/home/route.js
const router = require("express").Router();

const {
    listHomes,
    getHome,
    createHome,
    updateHome,
    deleteHome,
} = require("./controller");
const { guard } = require("../users/auth/middleware");
const { upload, toBase64 } = require("../config/upload");

// Normalize multer files into req.body as base64 strings
function mapFilesIntoBody(req, _res, next) {
    if (!req.body) req.body = {};
    if (!Array.isArray(req.files)) req.files = [];

    // Build map by fieldname
    const byField = req.files.reduce((acc, f) => {
        (acc[f.fieldname] ||= []).push(f);
        return acc;
    }, {});

    // 1) logoImage (single file)
    const logoFile = byField["logoImage"]?.[0];
    if (logoFile) {
        const base64 = toBase64(logoFile);
        if (base64) req.body.logoImage = base64;
    }

    // 2) brandsPreviewImage files - can be sent as brandsPreviewImage[0], brandsPreviewImage[1], etc.
    // Initialize array if not present
    if (!req.body.brandsPreviewImage) req.body.brandsPreviewImage = [];

    // Process files with indexed fieldnames: brandsPreviewImage[0], brandsPreviewImage[1], etc.
    for (const f of req.files) {
        const m = /^brandsPreviewImage\[(\d+)\]$/.exec(f.fieldname);
        if (!m) continue;
        const idx = Number(m[1]);
        const base64 = toBase64(f);
        if (base64) {
            // Ensure array is long enough
            while (req.body.brandsPreviewImage.length <= idx) {
                req.body.brandsPreviewImage.push("");
            }
            req.body.brandsPreviewImage[idx] = base64;
        }
    }

    // Also handle brandsPreviewImage as array fieldname (if sent as multiple files with same name)
    const brandFiles = byField["brandsPreviewImage"];
    if (brandFiles && brandFiles.length > 0 && req.body.brandsPreviewImage.length === 0) {
        req.body.brandsPreviewImage = brandFiles.map(toBase64).filter(Boolean);
    }

    // 3) servicesPreview - merge scalar fields coming as multipart keys:
    //    servicesPreview[0][title], servicesPreview[0][description], servicesPreview[0][keyServices], etc.
    if (!req.body.servicesPreview) req.body.servicesPreview = [];
    const ensureService = (i) => {
        while (req.body.servicesPreview.length <= i) req.body.servicesPreview.push({});
        if (!req.body.servicesPreview[i] || typeof req.body.servicesPreview[i] !== "object") {
            req.body.servicesPreview[i] = {};
        }
        return req.body.servicesPreview[i];
    };

    for (const [k, v] of Object.entries(req.body)) {
        const m = /^servicesPreview\[(\d+)\]\[(\w+)\]$/.exec(k);
        if (!m) continue;
        const idx = Number(m[1]);
        const prop = m[2];
        const service = ensureService(idx);
        service[prop] = v;
    }

    next();
}

// Public
router.get("/", listHomes);
router.get("/:id", getHome);

// Create
router.post(
    "/",
    guard,
    upload.any(),        // fileFilter still restricts to images
    mapFilesIntoBody,
    createHome
);

// Update
router.patch(
    "/:id",
    guard,
    upload.any(),
    mapFilesIntoBody,
    updateHome
);

// Delete
router.delete("/:id", guard, deleteHome);

module.exports = router;