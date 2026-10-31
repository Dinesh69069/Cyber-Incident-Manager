/**
 * Users.jsx
 * ---------
 * User management page — Admin only.
 * Shows all users with role selector, premium checkbox, and avatar initials.
 * Changes save immediately with a toast.
 * Non-admins see a 403 Forbidden panel.
 */

import { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, ShieldAlert } from 'lucide-react';
import { usersApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatDateTime } from '../utils/time';

function getInitials(name = '', email = '') {
  if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return email[0]?.toUpperCase() || '?';
}

const AVATAR_COLORS = [
  '#0b7f77', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669',
];

export default function Users() {
  const { isAdmin, user: currentUser } = useAuth();
  const toast = useToast();

  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await usersApi.list();
      setUsers(res.data);
    } catch { toast.error('Failed to load users.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchUsers();
    else setLoading(false);
  }, [isAdmin, fetchUsers]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
             style={{ background: 'var(--critical-soft)' }}>
          <ShieldAlert size={32} style={{ color: 'var(--critical)' }} />
        </div>
        <h2 className="font-sora font-700 text-xl mb-2" style={{ color: 'var(--critical)' }}>
          403 Forbidden
        </h2>
        <p className="text-sm text-muted max-w-xs">
          You do not have permission to access the Users page. Administrator privileges are required.
        </p>
      </div>
    );
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await usersApi.update(userId, { role: newRole });
      setUsers((prev) => prev.map((u) => u.id === userId ? res.data : u));
      toast.success('Role updated.');
    } catch { toast.error('Failed to update role.'); }
  };

  const handlePremiumChange = async (userId, isPremium) => {
    try {
      const res = await usersApi.update(userId, { is_premium: isPremium });
      setUsers((prev) => prev.map((u) => u.id === userId ? res.data : u));
      toast.success(`Premium ${isPremium ? 'enabled' : 'disabled'}.`);
    } catch { toast.error('Failed to update premium status.'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sora font-700 text-xl flex items-center gap-2" style={{ color: 'var(--fg)' }}>
          <UsersIcon size={20} /> Users
        </h1>
        <p className="text-sm text-muted">{users.length} platform accounts</p>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">Loading users…</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                  {['User', 'Email', 'Role', 'Premium', 'Joined'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const isSelf = u.id === currentUser?.id;
                  const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  return (
                    <tr
                      key={u.id}
                      className="border-b hover:bg-surface-2 transition-colors"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                            style={{ background: color }}
                            aria-hidden="true"
                          >
                            {getInitials(u.full_name, u.email)}
                          </div>
                          <div>
                            <div className="font-medium" style={{ color: 'var(--fg)' }}>
                              {u.full_name}
                              {isSelf && (
                                <span className="ml-1.5 text-[10px] text-muted">(you)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          id={`role-select-${u.id}`}
                          className="input w-auto text-xs py-1.5"
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          aria-label={`Role for ${u.full_name}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="analyst">Analyst</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            id={`premium-toggle-${u.id}`}
                            type="checkbox"
                            checked={u.is_premium}
                            onChange={(e) => handlePremiumChange(u.id, e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer"
                            aria-label={`Premium for ${u.full_name}`}
                          />
                          <span className="text-xs text-muted">
                            {u.is_premium ? 'Premium' : 'Free'}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {formatDateTime(u.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
