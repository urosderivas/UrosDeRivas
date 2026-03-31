import { Client } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  throw new Error("DATABASE_URL is missing in .env configurations.");
}

async function run() {
  console.log('Connecting to database...');
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  console.log('Altering market_items table to include custom_fields...');
  await client.query(`
    ALTER TABLE public.market_items ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '[]'::jsonb;
  `);

  console.log('Fetching public products from Clupik...');
  const homeRes = await fetch('https://api.clupik.com/clubs/67/shop/products/public/home?limit=100');
  const homeItems = await homeRes.json();
  
  const products = Array.isArray(homeItems) ? homeItems : homeItems.data || [];
  console.log(`Found ${products.length} Clupik items. Fetching details...`);

  for (const item of products) {
    // Avoid re-inserting if it's already there (optional, but good practice). We check by exact name match.
    const exist = await client.query('SELECT id FROM public.market_items WHERE name = $1', [item.title]);
    if (exist.rows.length > 0) {
      console.log(`Skipping "${item.title}" (Already exists)`);
      continue;
    }

    let detailData = item;
    try {
      const res = await fetch(`https://api.clupik.com/clubs/67/shop/product/${item.id}`);
      if (res.ok) {
        const raw = await res.json();
        detailData = raw.data || raw;
      }
    } catch(e) { console.warn(`Could not fetch details for ${item.id}`); }

    const rawId = item.id.replace('clupik_', '');
    const price = detailData.minPrice ? (detailData.minPrice / 100).toFixed(2) : 0;
    const imageUrl = `https://api.clupik.com/clubs/67/shop/image/${rawId}?format=large`;
    const name = detailData.title || item.title;

    const customFields = [];
    let sizes = [];
    
    // Parse Clupik Attributes (Tallas)
    if (detailData.productGroupAttributes) {
      const attr = detailData.productGroupAttributes.find(a => a.name === "Tallas" || a.name?.Tallas);
      if (attr && Array.isArray(attr.values)) {
        sizes = attr.values;
        customFields.push({
          name: 'Talla',
          type: 'categorical',
          options: attr.values,
          required: true
        });
      }
    }

    // Dummy examples as requested by User for showcase Custom Text Inputs
    if (name.toLowerCase().includes('cubre')) {
      customFields.push({ name: 'Jugador/a con el que tiene relación', type: 'text', required: true });
      customFields.push({ name: 'Equipo al que pertenece', type: 'text', required: true });
    }

    if (name.toLowerCase().includes('camiseta')) {
      customFields.push({ name: 'Número', type: 'text', required: true });
      customFields.push({ name: 'Nombre Impresión', type: 'text', required: true });
    }

    console.log(`-> Inserting: ${name} (Price: ${price}, Fields: ${customFields.length})`);
    await client.query(
      `INSERT INTO public.market_items (name, price, image_url, description, sizes, custom_fields) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, parseFloat(price), imageUrl, detailData.description || null, sizes, JSON.stringify(customFields)]
    );
  }

  console.log('Migration Complete.');
  await client.end();
}

run().catch(console.error);
