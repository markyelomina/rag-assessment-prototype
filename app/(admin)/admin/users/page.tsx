"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/lib/supabaseClient";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  cohort: string;
  status: string;
  lastLogin: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);

  const [cohortFilter, setCohortFilter] = useState("All Cohorts");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [dbCohorts, setDbCohorts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsersAndCohorts = async () => {
      // Fetch users and cohorts simultaneously
      const [usersResponse, cohortsResponse] = await Promise.all([
        supabase.from("Users").select(`
          *,
          Cohorts (
            cohort_name
          )
        `),
        supabase
          .from("Cohorts")
          .select("cohort_name")
          .eq("account_status", "Active")
          .order("cohort_name"),
      ]);

      if (usersResponse.error) {
        console.error("Error fetching users:", usersResponse.error.message);
        setIsLoading(false);
        return;
      }

      // Populate dynamic cohort dropdown
      if (cohortsResponse.data) {
        setDbCohorts(cohortsResponse.data.map((c) => c.cohort_name));
      }

      // Map the database rows to the UI structure
      const formattedUsers = usersResponse.data.map((user: any) => {
        let roleName = "Unknown";
        let displayCohort = "N/A";

        if (user.role_id === 1) {
          roleName = "Learner / Reviewer";
          displayCohort = user.Cohorts?.cohort_name || "Unassigned";
        } else if (user.role_id === 2) {
          roleName = "Teacher / Faculty";
          displayCohort = "Multiple (Managed)";
        } else if (user.role_id === 3) {
          roleName = "Admin";
          displayCohort = "N/A";
        }

        const loginStr = user.last_login
          ? new Date(user.last_login).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "Never logged in";

        return {
          id: user.user_id,
          name: user.name,
          email: user.email,
          role: roleName,
          cohort: displayCohort,
          status: user.account_status || "Active",
          lastLogin: loginStr,
        };
      });

      setAllUsers(formattedUsers);
      setIsLoading(false);
    };

    fetchUsersAndCohorts();
  }, []);

  const filteredUsers = allUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(debouncedUserSearch.toLowerCase()) ||
      user.email.toLowerCase().includes(debouncedUserSearch.toLowerCase());
    const matchesCohort =
      cohortFilter === "All Cohorts" ||
      user.cohort === cohortFilter ||
      (user.cohort === "Multiple (Managed)" &&
        roleFilter === "Teacher / Faculty");
    const matchesRole = roleFilter === "All Roles" || user.role === roleFilter;
    return matchesSearch && matchesCohort && matchesRole;
  });

  const toggleSelectUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter((userId) => userId !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  };

  const toggleSelectAll = () => {
    if (
      selectedUsers.length === filteredUsers.length &&
      filteredUsers.length > 0
    ) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map((u) => u.id));
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string, targetEmail: string) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";

    const { error } = await supabase
      .from("Users")
      .update({ account_status: newStatus })
      .eq("user_id", userId);

    if (!error) {
      // Instantly update the UI without reloading the page
      setAllUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, status: newStatus } : user,
        ),
      );

      const { data: sessionData } = await supabase.auth.getUser();
      const adminEmail = sessionData?.user?.email || "Unknown Admin";

      const { error: auditError } = await supabase.from("AuditLogs").insert([
        {
          user_email: adminEmail,
          role: "Admin",
          action: `Changed account status to ${newStatus} for user: ${targetEmail}`,
          type: "Security",
          severity: newStatus === "Inactive" ? "Warning" : "Info",
          ip_address: "Internal",
          user_agent: navigator.userAgent,
        },
      ]);

      if (auditError) {
        console.error("Error logging status change:", auditError.message);
      }

    } else {
      console.error("Error toggling status:", error.message);
    }
  };

  const handleResetPassword = async (userId: string, targetEmail: string) => {
    const defaultPassword = "malayan@2026";

    if (
      !confirm(
        `Are you sure you want to reset the password for ${targetEmail}?`,
      )
    )
      return;

    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const adminEmail = sessionData?.user?.email || "Unknown Admin";
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          newPassword: defaultPassword,
          adminEmail,
          targetEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      alert(
        `Success! Password for ${targetEmail} has been reset to: ${defaultPassword}`,
      );
    } catch (error: any) {
      console.error("Failed to reset password:", error);
      alert(`Error resetting password: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Global User Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">
            Manage all platform accounts, roles, and access statuses.
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/users/add")}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
        >
          + Add New User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col gap-4">
          <h3 className="font-bold text-slate-700">Filter Directory</h3>
          <div className="flex flex-col md:flex-row gap-3 w-full">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-4 pr-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white md:w-48"
            >
              <option value="All Roles">All Roles</option>
              <option value="Learner / Reviewer">Learner / Reviewer</option>
              <option value="Teacher / Faculty">Teacher / Faculty</option>
              <option value="Admin">Admin</option>
            </select>
            <select
              value={cohortFilter}
              onChange={(e) => setCohortFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white md:w-56"
            >
              <option value="All Cohorts">All Cohorts</option>
              {/* Dynamically map active cohorts from DB */}
              {dbCohorts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="Unassigned">Unassigned (Learners)</option>
              <option value="Multiple (Managed)">Multiple (Teachers)</option>
              <option value="N/A">N/A (Admins)</option>
            </select>
          </div>
        </div>

        {selectedUsers.length > 0 && (
          <div className="bg-blue-50 px-6 py-3 flex items-center justify-between border-b border-blue-100">
            <span className="text-sm font-bold text-blue-800">
              {selectedUsers.length} users selected
            </span>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 text-xs font-bold rounded hover:bg-blue-100 transition-colors shadow-sm">
                Bulk Password Reset
              </button>
              <button className="px-3 py-1.5 bg-white border border-blue-200 text-rose-600 text-xs font-bold rounded hover:bg-rose-50 transition-colors shadow-sm">
                Bulk Deactivate
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-200">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedUsers.length === filteredUsers.length &&
                      filteredUsers.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  User Details
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Role
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cohort
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Last Login
                </th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-12 text-center text-slate-500 font-bold"
                  >
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="No matching users"
                      message="We could not find any users matching your current search criteria. Try adjusting your filters."
                    />
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`transition-colors ${selectedUsers.includes(user.id) ? "bg-blue-50/50" : "hover:bg-slate-50"}`}
                  >
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => toggleSelectUser(user.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{user.name}</p>
                      <p className="text-xs font-bold text-slate-500">
                        {user.email}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-600">{user.role}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-600">{user.cohort}</p>
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          user.status === "Active" ? "success" : "neutral"
                        }
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-slate-500 font-bold">
                      {user.lastLogin}
                    </td>
                    <td className="p-4 text-right space-x-4 whitespace-nowrap">
                      <button
                        onClick={() => handleResetPassword(user.id, user.email)}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Reset Pass
                      </button>
                      <button
                        onClick={() => handleToggleStatus(user.id, user.status, user.email)}
                        className={`text-xs font-bold hover:underline ${user.status === "Active" ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {user.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-500">
          <span>
            Showing {filteredUsers.length > 0 ? "1" : "0"} to{" "}
            {filteredUsers.length} of {allUsers.length} users
          </span>
          <div className="flex gap-2">
            <button className="px-3 py-1 border border-slate-300 rounded bg-white text-slate-400 cursor-not-allowed shadow-sm">
              Previous
            </button>
            <button className="px-3 py-1 border border-slate-300 rounded bg-blue-600 text-white shadow-sm">
              1
            </button>
            <button className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 text-slate-600 shadow-sm">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}