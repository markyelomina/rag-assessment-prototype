import { createClient } from '@supabase/supabase-js';

// Ensure these exist in your Next.js .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseClient = createClient(supabaseUrl, supabaseKey);

/**
 * Uploads a PDF textbook to Supabase Storage.
 * @param file The PDF File object from an HTML file input.
 * @returns The storage path of the uploaded file, which will be sent to the FastAPI backend.
 */
export async function uploadTextbook(file: File): Promise<string> {
  // Validate that it is actually a PDF
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for ingestion.');
  }

  // Generate a unique, safe filename to prevent overwriting textbooks with the same name
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath = `raw_pdfs/${timestamp}_${safeName}`;

  console.log(`Uploading ${safeName} to Supabase...`);

  // Push the file directly to the Supabase 'textbooks' bucket
  const { data, error } = await supabaseClient.storage
    .from('textbooks')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false // Do not overwrite existing files
    });

  if (error) {
    console.error('Supabase Upload Error:', error.message);
    throw new Error(`Upload failed: ${error.message}`);
  }

  console.log('Upload successful! File path:', data.path);
  
  // Return the path so the UI can send it to your POST /api/ingest endpoint
  return data.path;
}