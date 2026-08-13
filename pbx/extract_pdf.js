const fs = require('fs');
const path = require('path');

const pdfPath = path.join('c:\\Users\\Nithep\\ไดรฟ์ของฉัน (cnithep@gmail.com)\\Hotel-ECS\\docs\\Manual Super Diamond-Compact\\Phonik Protocol CCH2.pdf');
const data = fs.readFileSync(pdfPath);

// Extract readable ASCII text from binary PDF
const text = data.toString('binary');
const lines = [];
let current = '';

for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 32 && c < 127) {
        current += text[i];
    } else {
        if (current.length >= 5) {
            lines.push(current.trim());
        }
        current = '';
    }
}

const result = lines.filter(l => l.trim().length > 4).join('\n');
fs.writeFileSync('cch2_extracted.txt', result);
console.log('Extracted', lines.length, 'text segments.');
console.log(result.substring(0, 8000));
