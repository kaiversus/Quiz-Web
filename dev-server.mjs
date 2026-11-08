import express from 'express';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

// Load the existing Vercel handler without changing its module format.
const proxySource = await readFile(path.join(root, 'api', 'proxy.js'), 'utf8');
const proxyModule = await import(`data:text/javascript;base64,${Buffer.from(proxySource).toString('base64')}`);

const app = express();
app.use(express.json({ limit: '6mb' }));
app.all('/api/proxy', proxyModule.default);

for (const asset of ['index.html', 'script.js', 'style.css', 'pic.gif']) {
    app.get(`/${asset}`, (_request, response) => response.sendFile(path.join(root, asset)));
}
app.get('/', (_request, response) => response.sendFile(path.join(root, 'index.html')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`Quiz Web: http://localhost:${port}`);
    if (!process.env.MY_API_KEY) console.log('Chưa có MY_API_KEY trong .env.local; chức năng tạo đề bằng AI sẽ chưa chạy.');
});
