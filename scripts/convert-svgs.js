const fs = require('fs');
const path = require('path');
const { transform } = require('@svgr/core');

const ASSETS_DIR = path.join(__dirname, '../src/app/assets');
const TILES_FILE = path.join(__dirname, '../src/app/data/tiles.ts');

function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

function getSvgFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getSvgFiles(filePath, fileList);
    } else if (file.endsWith('.svg')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function run() {
  console.log('🚀 Converting SVGs to TSX via SVGR...\n');

  const svgFiles = getSvgFiles(ASSETS_DIR);
  const convertedMap = new Map();

  for (const fullSvgPath of svgFiles) {
    const fileParsed = path.parse(fullSvgPath);
    const rawName = fileParsed.name;
    const componentName = toPascalCase(rawName);
    const tsxPath = path.join(fileParsed.dir, `${componentName}.tsx`);

    const rawSvg = fs.readFileSync(fullSvgPath, 'utf8');

    // Transform SVG to React component
    let jsxCode = await transform(
      rawSvg,
      {
        typescript: true,
        jsxRuntime: 'automatic',
        expandProps: 'end',
        plugins: ['@svgr/plugin-jsx'],
      },
      { componentName },
    );

    // Remove the invalid standalone `className={className}` attribute injected into <svg>
    jsxCode = jsxCode.replace(/\s*className=\{className\}/g, '');

    // Keep authored text transforms on a wrapper. Mirrored tiles can then
    // counter-mirror the glyphs without disturbing the text's position or rotation.
    jsxCode = jsxCode.replace(
      /<text\b([^>]*?)\s+transform=(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/text>/g,
      (_, before, quote, textTransform, after, content) =>
        `<g transform=${quote}${textTransform}${quote}><text${before}${after}>${content}</text></g>`,
    );

    // Ensure both named and default exports are generated
    const finalTsx = jsxCode.replace(
      `export default ${componentName};`,
      `export { ${componentName} };\nexport default ${componentName};`,
    );

    fs.writeFileSync(tsxPath, finalTsx, 'utf8');
    console.log(`  ✓ Generated: ${path.relative(process.cwd(), tsxPath)}`);

    const relativeSvgPath = path
      .relative(path.join(__dirname, '../src/app'), fullSvgPath)
      .replace(/\\/g, '/');

    const relativeTsxImport = `@/app/${path
      .relative(path.join(__dirname, '../src/app'), tsxPath)
      .replace(/\\/g, '/')
      .replace(/\.tsx$/, '')}`;

    convertedMap.set(relativeSvgPath, { componentName, importPath: relativeTsxImport });
  }

  // Step 2: Update tiles.ts
  if (fs.existsSync(TILES_FILE)) {
    console.log(`\n⚙️ Updating ${path.basename(TILES_FILE)}...`);
    let tilesContent = fs.readFileSync(TILES_FILE, 'utf8');
    const importsToInject = [];

    convertedMap.forEach(({ componentName, importPath }, relativeSvgPath) => {
      const pathRegex = new RegExp(
        `path:\\s*['"](\\/?)${relativeSvgPath.replace(/\//g, '\\/')}['"]`,
        'g',
      );

      if (pathRegex.test(tilesContent)) {
        tilesContent = tilesContent.replace(pathRegex, `component: ${componentName}`);
        importsToInject.push(`import { ${componentName} } from '${importPath}';`);
      }
    });

    if (importsToInject.length > 0) {
      const uniqueImports = Array.from(new Set(importsToInject)).join('\n');
      tilesContent = `${uniqueImports}\n\n${tilesContent}`;
      fs.writeFileSync(TILES_FILE, tilesContent, 'utf8');
      console.log(`  ✓ Updated ${path.basename(TILES_FILE)} successfully.`);
    }
  }

  console.log('\n🎉 Clean conversion completed!');
}

run();
