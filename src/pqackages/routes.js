// src/packages/routes.js
const router = require("express").Router();
const path = require("path");

const {
    listPackages,
    getPackage,
    createPackage,
    updatePackage,
    deletePackage,
} = require("./controller");

const { guard } = require("../users/auth/middleware");
const { upload } = require("../config/upload");

/**
 * Normalize multer files + multipart fields into req.body for featuredStories.
 * - Supports:
 *   - Files:  featuredStories[0][image]  or  featuredStories.0.image
 *   - Scalars: featuredStories[0][title], [description], [author], [date], [fullVersion]
 *              or dotted notation featuredStories.0.title, etc.
 */
function mapFilesIntoBody(req, _res, next) {
    if (!req.body) req.body = {};
    if (!Array.isArray(req.files)) req.files = [];

    // Build map by fieldname
    const byField = req.files.reduce((acc, f) => {
        (acc[f.fieldname] ||= []).push(f);
        return acc;
    }, {});

    const toWeb = (f) => {
        const name = f?.filename || (f?.path ? path.basename(f.path) : null);
        return name ? `/uploads/${name}` : null;
    };

    // Ensure array
    if (!Array.isArray(req.body.featuredStories)) {
        // If JSON string was provided, leave it; controller can parse JSON.
        // But if we need to place per-index values, convert to array to merge.
        // We'll only convert when we actually set an indexed value.
        req.body._fsNeedsArrayShim = true;
    }

    const ensureStoriesArray = () => {
        if (Array.isArray(req.body.featuredStories)) return;
        req.body.featuredStories = [];
    };

    const ensureStory = (i) => {
        ensureStoriesArray();
        while (req.body.featuredStories.length <= i) req.body.featuredStories.push({});
        if (!req.body.featuredStories[i] || typeof req.body.featuredStories[i] !== "object") {
            req.body.featuredStories[i] = {};
        }
        return req.body.featuredStories[i];
    };

    // 1) Map uploaded images for both bracket & dotted notations
    for (const f of req.files) {
        let m =
            /^featuredStories\[(\d+)\]\[image\]$/.exec(f.fieldname) ||
            /^featuredStories\.(\d+)\.image$/.exec(f.fieldname);
        if (!m) continue;
        const idx = Number(m[1]);
        const story = ensureStory(idx);
        const web = toWeb(f);
        if (web) story.image = web;
    }

    // 2) Merge scalar fields that come as multipart keys:
    //    - featuredStories[0][title] / [description] / [author] / [date] / [fullVersion]
    //    - featuredStories.0.title (dotted)
    for (const [k, v] of Object.entries(req.body)) {
        let m =
            /^featuredStories\[(\d+)\]\[(\w+)\]$/.exec(k) ||
            /^featuredStories\.(\d+)\.(\w+)$/.exec(k);
        if (!m) continue;
        const idx = Number(m[1]);
        const prop = m[2];
        const story = ensureStory(idx);
        story[prop] = v;
        // Optionally delete the raw key to keep body clean:
        // delete req.body[k];
    }

    // Clean shim marker
    delete req.body._fsNeedsArrayShim;

    next();
}

// Public
router.get("/", listPackages);
router.get("/:id", getPackage);

// Create
router.post(
    "/",
    guard,
    upload.any(),       // fileFilter in your upload config should restrict to images
    mapFilesIntoBody,
    createPackage
);

// Update
router.patch(
    "/:id",
    guard,
    upload.any(),
    mapFilesIntoBody,
    updatePackage
);

// Delete
router.delete("/:id", guard, deletePackage);

module.exports = router;
