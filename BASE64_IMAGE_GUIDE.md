# Base64 Image Upload Guide

## Overview
All image uploads have been converted from file storage to base64 encoding. Images are now stored as base64 strings in the database instead of file paths.

## Changes Made

1. **Multer Configuration**: Changed from `diskStorage` to `memoryStorage` - files are now stored in memory as buffers
2. **Image Conversion**: All uploaded images are automatically converted to base64 data URIs
3. **Database Storage**: Images are stored as base64 strings (e.g., `data:image/jpeg;base64,/9j/4AAQ...`)

## How to Use Base64 Images

### Frontend: Uploading Images

#### Using FormData (Multipart)
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

fetch('/api/uploads/image', {
  method: 'POST',
  body: formData
})
.then(res => res.json())
.then(data => {
  // Response: { image: "data:image/jpeg;base64,/9j/4AAQ...", size: 12345, mimetype: "image/jpeg" }
  console.log('Base64 image:', data.image);
});
```

#### Using JSON (Direct Base64)
```javascript
// If you already have a base64 string
fetch('/api/services', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My Service',
    image: 'data:image/jpeg;base64,/9j/4AAQ...' // Your base64 string
  })
});
```

### Frontend: Displaying Base64 Images

#### In HTML `<img>` tag
```html
<!-- Direct use of base64 string -->
<img src="data:image/jpeg;base64,/9j/4AAQ..." alt="Image" />

<!-- From API response -->
<img src="${item.image}" alt="Image" />
```

#### In React
```jsx
<img src={item.image} alt="Image" />
```

#### In Vue
```vue
<img :src="item.image" alt="Image" />
```

### API Response Format

#### Single Image Upload (`POST /api/uploads/image`)
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
  "size": 12345,
  "mimetype": "image/jpeg",
  "originalname": "photo.jpg"
}
```

#### Resources with Images
All resources (brands, services, news, etc.) now store images as base64 strings:

```json
{
  "_id": "...",
  "title": "My Brand",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
  ...
}
```

## Supported Endpoints

All these endpoints now return/accept base64 images:

- `POST /api/uploads/image` - Single image upload
- `POST /api/services` - Service with image
- `PATCH /api/services/:id` - Update service image
- `POST /api/brands` - Brand with images (heroBgImage, featuredItems, etc.)
- `PATCH /api/brands/:id` - Update brand images
- `POST /api/home` - Home page images
- `POST /api/news` - News items with images
- `POST /api/portfolio` - Portfolio items with images
- `POST /api/partners-reviews` - Partner reviews with images
- `POST /api/packages` - Packages with featured story images

## Important Notes

1. **Image Size**: Base64 strings are ~33% larger than binary files. The 5MB limit still applies.
2. **Database**: Base64 strings can be stored directly in MongoDB as strings.
3. **Performance**: For large images, consider implementing image compression on the frontend before uploading.
4. **Compatibility**: Base64 data URIs work in all modern browsers and can be used directly in:
   - HTML `<img>` tags
   - CSS `background-image`
   - Canvas `drawImage()`
   - Any place that accepts a URL

## Example: Complete Upload Flow

```javascript
// 1. User selects an image
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

// 2. Option A: Upload via FormData (recommended)
const formData = new FormData();
formData.append('image', file);

const response = await fetch('/api/uploads/image', {
  method: 'POST',
  body: formData
});
const { image } = await response.json();

// 3. Use the base64 string
document.querySelector('#preview').src = image;

// 4. Save to your resource
await fetch('/api/services', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My Service',
    image: image  // Use the base64 string directly
  })
});
```

## Converting File to Base64 on Frontend (Optional)

If you want to convert files to base64 on the frontend before sending:

```javascript
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Usage
const file = fileInput.files[0];
const base64 = await fileToBase64(file);
// Now send base64 in JSON body instead of FormData
```

