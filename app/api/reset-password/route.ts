import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { userId, newPassword, adminEmail, targetEmail } = await request.json();

    // Initialize the Admin client using the secret Service Role Key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! 
    );

    // Force update the user's password bypassing normal auth rules
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) throw error;

    await supabaseAdmin.from('AuditLogs').insert([{
      user_email: adminEmail,
      role: 'Admin',
      action: `Forced password reset for user ID: ${targetEmail}`,
      type: 'Security',
      severity: 'Warning',
      ip_address: 'Internal API',
      user_agent: 'Server Route'
    }]);

    return NextResponse.json({ success: true, message: 'Password reset successful' });
  } catch (error: any) {
    console.error("Admin Password Reset Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}