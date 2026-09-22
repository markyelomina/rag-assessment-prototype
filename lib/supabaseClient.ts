import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // forces Supabase to use Cookies instead of Local Storage
    storage: {
      getItem: (key) => {
        if (typeof document === 'undefined') return null;
        const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
      },
      setItem: (key, value) => {
        if (typeof document === 'undefined') return;
        // Sets a secure cookie that the Next.js middleware can read
        document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax; Secure`;
      },
      removeItem: (key) => {
        if (typeof document === 'undefined') return;
        document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    }
  }
});