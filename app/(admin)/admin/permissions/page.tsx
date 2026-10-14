'use client';

import FullScreenLoader from '@/components/ui/FullScreenLoader';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/ToastContext';

interface RoleData {
  id: number;
  name: string;
  users: number;
  permissions: { manageUsers: boolean; uploadDocs: boolean; viewLogs: boolean };
  members: string[];
  displayMembers: string[];
}

export default function AdminPermissionsPage() {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [roles, setRoles] = useState<RoleData[]>([]);

  // 1. Fetch Dynamic Roles and Users
  const fetchRolesAndUsers = async () => {
    setIsLoading(true);
    
    // Fetch Roles using your specific role_id
    const { data: rolesData, error: rolesError } = await supabase
      .from('Roles')
      .select('*')
      .order('role_id', { ascending: true });

    // Fetch Users to map into their respective roles
    const { data: usersData, error: usersError } = await supabase
      .from('Users')
      .select('name, role_id');

    if (rolesError || usersError) {
      addToast('Failed to load roles or users.', 'error');
      setIsLoading(false);
      return;
    }

    if (rolesData && usersData) {
      const formattedRoles = rolesData.map((role: any) => {
        // Filter users belonging to this role
        const roleUsers = usersData
          .filter((u: any) => u.role_id === role.role_id)
          .map((u: any) => u.name || 'Unknown User');

        // Format the members array for display
        const displayMembers = roleUsers.length > 4 
          ? [...roleUsers.slice(0, 3), `+ ${roleUsers.length - 3} more users`]
          : (roleUsers.length > 0 ? roleUsers : ['No users assigned yet']);

        return {
          id: role.role_id,
          name: role.role_name,
          users: roleUsers.length,
          permissions: {
            manageUsers: role.manage_users || false,
            uploadDocs: role.upload_docs || false,
            viewLogs: role.view_logs || false
          },
          members: roleUsers,
          displayMembers: displayMembers
        };
      });
      
      setRoles(formattedRoles);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRolesAndUsers();
  }, []);

  // 2. Local State Toggle for Permissions
  const togglePermission = (roleId: number, permissionKey: 'manageUsers' | 'uploadDocs' | 'viewLogs') => {
    // Prevent locking out the core Admin role
    const targetRole = roles.find(r => r.id === roleId);
    if (targetRole?.name === 'Admin' && permissionKey === 'manageUsers') return;

    setRoles(roles.map(role => {
      if (role.id === roleId) {
        return {
          ...role,
          permissions: {
            ...role.permissions,
            [permissionKey]: !role.permissions[permissionKey]
          }
        };
      }
      return role;
    }));
  };

  const toggleExpand = (roleId: number) => {
    setExpandedRole(expandedRole === roleId ? null : roleId);
  };

  // 3. Create Custom Role in Database
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setIsSaving(true);
    
    const { error } = await supabase.from('Roles').insert([{
      role_name: newRoleName,
      manage_users: false,
      upload_docs: false,
      view_logs: false
    }]);

    if (error) {
      addToast(`Error creating role: ${error.message}`, 'error');
    } else {
      addToast('New role created successfully.', 'success');
      setNewRoleName('');
      setShowCreateModal(false);
      fetchRolesAndUsers(); // Refresh the list
    }
    setIsSaving(false);
  };

  // 4. Save Modified Permissions to Database
  const handleSaveConfirmed = async () => {
    setIsSaving(true);
    
    // Prepare the batch update payload based on current local state
    const updatePromises = roles.map(role => 
      supabase.from('Roles').update({
        manage_users: role.permissions.manageUsers,
        upload_docs: role.permissions.uploadDocs,
        view_logs: role.permissions.viewLogs
      }).eq('role_id', role.id) // Target your specific role_id column
    );

    const results = await Promise.all(updatePromises);
    const hasError = results.some(res => res.error);

    if (hasError) {
      addToast('Some permissions failed to update.', 'error');
    } else {
      addToast('Global access permissions successfully saved.', 'success');
      setShowSaveModal(false);
    }
    
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <FullScreenLoader 
        isOpen={isLoading || isSaving} 
        message="Syncing roles and permissions..." 
      />
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Role & Permissions Configuration Panel</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Manage system access levels and create custom administrative roles.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
        >
          + Create Custom Role
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-600">User Role</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-600">Active Users</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-600 text-center">
                  <div className="flex items-center justify-center gap-1.5 cursor-help group relative">
                    Manage Platform Users
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] rounded p-2 text-center shadow-lg z-10 font-normal normal-case">
                      Grants the ability to create, edit, invite, or deactivate platform user accounts.
                    </div>
                  </div>
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-600 text-center">
                  <div className="flex items-center justify-center gap-1.5 cursor-help group relative">
                    Upload RAG Materials
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] rounded p-2 text-center shadow-lg z-10 font-normal normal-case">
                      Allows uploading, deleting, and managing knowledge base files for the AI generation engine.
                    </div>
                  </div>
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-600 text-center">
                  <div className="flex items-center justify-center gap-1.5 cursor-help group relative">
                    View Security Logs
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] rounded p-2 text-center shadow-lg z-10 font-normal normal-case">
                      Allows access to view historical system audit logs and tracked user activities.
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {roles.map((role) => (
                <React.Fragment key={role.id}>
                  <tr className={`transition-colors ${expandedRole === role.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="p-4">
                      <button 
                        onClick={() => toggleExpand(role.id)}
                        className="font-bold text-slate-800 hover:text-blue-600 flex items-center gap-2 transition-colors"
                      >
                        <svg className={`w-4 h-4 transition-transform ${expandedRole === role.id ? 'rotate-90 text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        {role.name}
                      </button>
                    </td>
                    <td className="p-4 text-slate-500 font-bold">{role.users} accounts</td>
                    
                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={role.permissions.manageUsers} 
                        onChange={() => togglePermission(role.id, 'manageUsers')}
                        disabled={role.name === 'Admin'}
                        className={`h-4 w-4 rounded focus:ring-blue-500 ${role.name === 'Admin' ? 'text-blue-400 border-slate-200 cursor-not-allowed opacity-60' : 'text-blue-600 border-slate-300 cursor-pointer'}`}
                        title={role.name === 'Admin' ? 'Core admin permissions cannot be disabled' : ''}
                      />
                    </td>

                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={role.permissions.uploadDocs} 
                        onChange={() => togglePermission(role.id, 'uploadDocs')}
                        className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={role.permissions.viewLogs} 
                        onChange={() => togglePermission(role.id, 'viewLogs')}
                        className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  </tr>
                  
                  {expandedRole === role.id && (
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={5} className="p-6 pl-10">
                        <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">Assigned Members ({role.users})</h4>
                        <div className="flex flex-wrap gap-2">
                          {role.displayMembers.map((member, idx) => (
                            <span key={idx} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded shadow-sm">
                              {member}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={() => fetchRolesAndUsers()} 
            className="px-5 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-white transition-colors shadow-sm"
          >
            Discard Changes
          </button>
          <button 
            onClick={() => setShowSaveModal(true)}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Save Global Access
          </button>
        </div>
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800">Confirm Access Update</h3>
            </div>
            <p className="text-sm text-slate-600 font-bold mb-6 pl-13">
              You are about to modify system access permissions. These changes will be applied immediately and will affect active users currently logged into the platform.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveConfirmed}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Confirm Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">Create Custom Role</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Role Title</label>
                <input 
                  type="text" 
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Assistant Admin" 
                  required
                  disabled={isSaving}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" 
                />
                <p className="text-xs font-bold text-slate-500 mt-2">New roles will start with zero active permissions by default. You can adjust them after creation.</p>
              </div>
              
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-2">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSaving ? 'Creating...' : 'Add Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}