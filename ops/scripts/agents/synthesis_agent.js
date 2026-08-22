'use strict';

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '../../../doc/raw');
const WIKI_DIR = path.join(__dirname, '../../../doc/wiki');

// Helper to parse frontmatter and body
function parseMarkdown(content) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    let metadata = {};
    let body = '';
    
    if (match) {
        const yamlStr = match[1];
        body = match[2];
        
        const lines = yamlStr.split(/\r?\n/);
        for (const line of lines) {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex !== -1) {
                const key = line.substring(0, separatorIndex).trim();
                const value = line.substring(separatorIndex + 1).trim();
                metadata[key] = value;
            }
        }
    } else {
        body = content;
    }
    
    return { metadata, body };
}

// Synthesis Agent logic
function runSynthesis() {
    console.log('🤖 [Synthesis Agent] Starting raw docs synthesis...');
    
    if (!fs.existsSync(RAW_DIR)) {
        console.error(`[Synthesis Agent] ❌ Raw directory does not exist: ${RAW_DIR}`);
        return;
    }
    
    if (!fs.existsSync(WIKI_DIR)) {
        fs.mkdirSync(WIKI_DIR, { recursive: true });
    }
    
    const files = fs.readdirSync(RAW_DIR);
    let distilledCount = 0;
    
    for (const file of files) {
        const filePath = path.join(RAW_DIR, file);
        const stat = fs.statSync(filePath);
        
        // Process only root .md files
        if (stat.isFile() && file.endsWith('.md')) {
            console.log(`[Synthesis Agent] Processing raw file: ${file}`);
            
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const { metadata, body } = parseMarkdown(rawContent);
            
            // Distill content (Extract main headings, bullet points, citations)
            const lines = body.split(/\r?\n/);
            let summary = '';
            let keyPoints = [];
            let citations = [];
            
            let inCapturedContent = false;
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                // Track if we are inside captured content
                if (trimmed.includes('## 📝 Captured Content')) {
                    inCapturedContent = true;
                    continue;
                }
                
                if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                    const point = trimmed.substring(1).trim();
                    if (point && keyPoints.length < 15) {
                        keyPoints.push(point);
                    }
                }
                
                // Simple citation extractor (markdown links or arXiv mentions)
                const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                let linkMatch;
                while ((linkMatch = linkRegex.exec(line)) !== null) {
                    citations.push(`- **${linkMatch[1]}**: ${linkMatch[2]}`);
                }
                
                if (trimmed.toLowerCase().includes('arxiv')) {
                    const arxivMatch = trimmed.match(/arxiv\s*([0-9]+\.[0-9]+)/i);
                    if (arxivMatch && !citations.some(c => c.includes(arxivMatch[0]))) {
                        citations.push(`- **arXiv Preprint**: https://arxiv.org/abs/${arxivMatch[1]}`);
                    }
                }
            }
            
            // Generate standard summary if none found
            if (keyPoints.length === 0) {
                keyPoints = lines
                    .filter(l => l.trim().length > 30 && !l.trim().startsWith('#'))
                    .slice(0, 5)
                    .map(l => l.trim());
            }

            const title = metadata.title || file.replace('.md', '');
            const author = metadata.author || 'Unknown';
            const source = metadata.source || 'N/A';
            const created = metadata.created || new Date().toISOString();
            
            // Create Evergreen Note Draft
            const draftContent = `---
title: "${title}"
status: "draft"
synthesized_at: "${new Date().toISOString()}"
original_file: "doc/raw/${file}"
original_source: "${source}"
original_author: "${author}"
---

# 🌲 ${title} (Evergreen Note - Draft)

> [!NOTE]
> เอกสารฉบับนี้ถูกสกัดใจความสำคัญโดย Synthesis Agent เมื่อ ${new Date().toLocaleDateString('th-TH')} รอการอนุมัติและตรวจสอบความถูกต้องจาก Verification Agent

## 📌 บทสรุป (Summary)
เอกสารนี้อธิบายเกี่ยวกับหัวข้อ **${title}** ซึ่งมีสาระสำคัญที่เกี่ยวกับการพัฒนาและบูรณาการระบบควบคุมของโปรเจกต์ Hotel ECS และสถาปัตยกรรม Agentic AI Harness

## 🔑 ประเด็นสำคัญ (Key Takeaways)
${keyPoints.map(point => `- ${point}`).join('\n')}

${citations.length > 0 ? `## 📚 แหล่งอ้างอิง (Citations & References)
${citations.join('\n')}` : ''}

## 📝 บันทึกประวัติ
- บันทึกการสังเคราะห์โดย: \`synthesis_agent.js\`
- แหล่งอิมพอร์ตต้นฉบับ: ${source} (${created})
`;

            const draftFileName = `draft_${file}`;
            const draftPath = path.join(WIKI_DIR, draftFileName);
            
            fs.writeFileSync(draftPath, draftContent, 'utf8');
            console.log(`[Synthesis Agent] Draft saved: doc/wiki/${draftFileName}`);
            distilledCount++;
        }
    }
    
    console.log(`🤖 [Synthesis Agent] Synthesis completed. Created ${distilledCount} drafts.`);
}

runSynthesis();
module.exports = { runSynthesis };
