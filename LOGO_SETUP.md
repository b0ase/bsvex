# BSV Logo Setup

## Adding the Logo

1. Copy your `BSV_logo_01.jpg` file to the `public/images/` directory
2. The logo will automatically be used in the header and footer

## Logo Specifications

- **File**: BSV_logo_01.jpg
- **Location**: `public/images/BSV_logo_01.jpg`
- **Size**: Recommended 200x200px or larger for crisp display
- **Format**: JPG, PNG, or SVG (SVG preferred for scalability)

## Current Usage

The logo is used in:
- Header navigation (40x40px display)
- Footer branding (40x40px display)
- Favicon (browser tab icon)

## Customization

To adjust the logo size or styling, modify:
- `src/components/Header.tsx` - for header logo
- `src/components/Footer.tsx` - for footer logo
- `src/app/layout.tsx` - for favicon settings

## Alternative Formats

If you have the logo in different formats:
- **SVG**: Best for scalability, update the `src` attribute to use `.svg`
- **PNG**: Good for transparency, update the `src` attribute to use `.png`
- **Multiple sizes**: Add different sizes for different use cases 