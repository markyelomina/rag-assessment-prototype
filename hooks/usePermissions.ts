import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface UserPermissions {
  manageUsers: boolean;
  uploadDocs: boolean;
  viewLogs: boolean;
  isLoading: boolean;
  roleName: string;
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<UserPermissions>({
    manageUsers: false,
    uploadDocs: false,
    viewLogs: false,
    isLoading: true,
    roleName: '',
  });

  useEffect(() => {
    const fetchPermissions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Fetch the user's role_id, then join with the Roles table to get the flags
      const { data: userData } = await supabase
        .from('Users')
        .select(`
          role_id,
          Roles ( role_name, manage_users, upload_docs, view_logs )
        `)
        .eq('user_id', user.id)
        .single();

      if (userData && userData.Roles) {
        const roleInfo = Array.isArray(userData.Roles) ? userData.Roles[0] : userData.Roles;
        
        setPermissions({
          manageUsers: roleInfo.manage_users || false,
          uploadDocs: roleInfo.upload_docs || false,
          viewLogs: roleInfo.view_logs || false,
          roleName: roleInfo.role_name || 'Unknown',
          isLoading: false,
        });
      } else {
        setPermissions(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchPermissions();
  }, []);

  return permissions;
}