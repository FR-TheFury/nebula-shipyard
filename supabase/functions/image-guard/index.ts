import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_FILE_SIZE = 2_000_000; // 2 MB
const ALLOWED_BUCKETS = ['avatars', 'posts', 'gallery'];
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Image guard webhook triggered:', payload);

    const { type, record } = payload;

    // Only process INSERT events
    if (type !== 'INSERT') {
      return new Response(
        JSON.stringify({ ok: true, message: 'Not an INSERT event' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { id, bucket_id, name, metadata } = record;
    const mimetype = metadata?.mimetype;
    const size = metadata?.size;

    console.log(`Validating file: ${name} in bucket ${bucket_id}, size: ${size}, type: ${mimetype}`);

    let shouldDelete = false;
    let reason = '';

    // Check bucket
    if (!ALLOWED_BUCKETS.includes(bucket_id)) {
      shouldDelete = true;
      reason = `Invalid bucket: ${bucket_id}`;
    }

    // Check mimetype
    if (!shouldDelete && !ALLOWED_MIMETYPES.includes(mimetype)) {
      shouldDelete = true;
      reason = `Invalid mimetype: ${mimetype}. Only JPG/PNG allowed.`;
    }

    // Check size
    if (!shouldDelete && size > MAX_FILE_SIZE) {
      shouldDelete = true;
      reason = `File too large: ${size} bytes. Max ${MAX_FILE_SIZE} bytes (2MB).`;
    }

    if (shouldDelete) {
      console.log(`Deleting file ${name}: ${reason}`);

      // Delete the file
      const { error: deleteError } = await supabase
        .storage
        .from(bucket_id)
        .remove([name]);

      if (deleteError) {
        console.error('Error deleting file:', deleteError);
      }

      // Log to audit
      await supabase.from('audit_logs').insert({
        action: 'image_guard_reject',
        target: `${bucket_id}/${name}`,
        meta: {
          reason,
          size,
          mimetype,
          timestamp: new Date().toISOString()
        }
      });

      return new Response(
        JSON.stringify({ 
          ok: true, 
          deleted: true, 
          reason 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`File ${name} validated successfully`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        deleted: false, 
        message: 'File validated successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in image-guard:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
