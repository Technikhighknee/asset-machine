import app from './app.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

app.listen(port, host, () => {
  console.log(`Asset Machine listening on http://${host}:${port}`);
});
