import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Securely Count Users
    const { data: roles } = await supabaseAdmin.from('Roles').select('role_id, role_name');
    const studentRoleId = roles?.find(r => r.role_name?.toLowerCase() === 'student')?.role_id || 3;
    const facultyRoleId = roles?.find(r => r.role_name?.toLowerCase() === 'faculty')?.role_id || 2;

    const [ { count: studentCount }, { count: facultyCount } ] = await Promise.all([
      supabaseAdmin.from('Users').select('*', { count: 'exact', head: true }).eq('role_id', studentRoleId),
      supabaseAdmin.from('Users').select('*', { count: 'exact', head: true }).eq('role_id', facultyRoleId)
    ]);

    // 2. Exact Storage Calculation (1 GB Free Tier Limit)
    let storageUsedGb = "0.00";
    const { data: totalBytes, error: rpcError } = await supabaseAdmin.rpc('get_bucket_size', { bucket_name: 'textbooks' });
    
    if (!rpcError && totalBytes !== null) {
      const gb = Number(totalBytes) / (1024 * 1024 * 1024);
      storageUsedGb = gb > 0 && gb < 0.01 ? "0.01" : gb.toFixed(2);
    }

    // 3. Weekly AI Token Chart (Aggregates Total Tokens)
    const past7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    const startDate = past7Days[0].toISOString();

    const { data: weeklyLogs } = await supabaseAdmin
      .from('Token_Logs')
      .select('created_at, total_tokens')
      .gte('created_at', startDate);

    const weeklyChart = past7Days.map(dateObj => {
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const nextDay = new Date(dateObj);
      nextDay.setDate(nextDay.getDate() + 1);

      const tokensOnDay = weeklyLogs?.filter(log => {
        const logDate = new Date(log.created_at);
        return logDate >= dateObj && logDate < nextDay;
      }).reduce((sum, log) => sum + (log.total_tokens || 0), 0) || 0;

      return { day: dayName, tokens: Math.round(tokensOnDay / 1000) };
    });

    // 4. Daily API Request Quota (Aligned to Midnight PT)
    const now = new Date();
    const ptFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'short'
    });
    
    const parts = ptFormatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const tz = parts.find(p => p.type === 'timeZoneName')?.value; 
    
    const offset = tz === 'PDT' ? '-07:00' : '-08:00';
    const midnightUTC = new Date(`${year}-${month}-${day}T00:00:00${offset}`).toISOString();

    // 5. Fire Concurrent Backend Health & Quota Queries
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60000).toISOString();

    const [ 
      { count: genCount }, 
      { count: evalCount },
      { data: heartbeatData },
      { count: stalledIngestionCount } 
    ] = await Promise.all([
      supabaseAdmin.from('Token_Logs').select('*', { count: 'exact', head: true }).gte('created_at', midnightUTC).eq('task_type', 'Exam Generation'),
      supabaseAdmin.from('Token_Logs').select('*', { count: 'exact', head: true }).gte('created_at', midnightUTC).eq('task_type', 'Item Evaluation'),
      supabaseAdmin.from('Worker_Health').select('last_heartbeat').eq('worker_name', 'ai_celery_worker').single(),
      supabaseAdmin.from('Material Requests').select('*', { count: 'exact', head: true }).eq('status', 'Processing').lte('updated_at', fifteenMinutesAgo)
    ]);

    const genRequestsK = ((genCount || 0) / 1000).toFixed(2);
    const evalRequestsK = ((evalCount || 0) / 1000).toFixed(2);

    // Calculate worker latency based on the heartbeat
    let workerStatus = "Offline (No heartbeat table)";
    if (heartbeatData?.last_heartbeat) {
      const heartbeatTime = new Date(heartbeatData.last_heartbeat).getTime();
      const timeSinceLastPing = (Date.now() - heartbeatTime) / 1000;
      workerStatus = timeSinceLastPing < 120 ? "Operational" : "Offline (No recent heartbeat)";
    }

    return NextResponse.json({
      studentCount: studentCount || 0,
      facultyCount: facultyCount || 0,
      storageUsedGb,
      storageTotalGb: 1.0, 
      genRequestsK,
      evalRequestsK,
      weeklyChart,
      backendHealth: {
        aiWorker: workerStatus,
        stalledIngestionJobs: stalledIngestionCount || 0
      }
    });
    
  } catch (error: any) {
    console.error("Telemetry Endpoint Error:", error);
    return NextResponse.json({ error: error.message || 'Telemetry unavailable' }, { status: 500 });
  }
}