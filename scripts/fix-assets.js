const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Fix style block: convert { '\n ... ' } or {"\n ... "} to {` ... `}
    const newContent = content.replace(/<style>\s*\{\s*(['"])\\n([\s\S]*?)\1\s*\}\s*<\/style>/g, (match, quote, p1) => {
        const css = p1.replace(/\\n/g, '\n');
        changed = true;
        return `<style>{\`${css}\`}</style>`;
    });

    if (changed) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Updated ${filePath}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath);
        } else if (filePath.endsWith('.tsx')) {
            processFile(filePath);
        }
    }
}

walkDir(path.join(__dirname, 'src', 'app', 'assets'));
