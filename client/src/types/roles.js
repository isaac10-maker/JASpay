/**
 * Rôles utilisateur JASpay
 * Ces rôles sont gérés EXCLUSIVEMENT côté serveur (Supabase / base de données).
 * Le frontend ne doit jamais permettre à un utilisateur de modifier son propre rôle.
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  AGENT: 'agent',
  MODERATOR: 'moderator',
  USER: 'user',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Administrateur',
  [ROLES.ADMIN]: 'Administrateur',
  [ROLES.AGENT]: 'Agent',
  [ROLES.MODERATOR]: 'Modérateur',
  [ROLES.USER]: 'Utilisateur',
};

/**
 * Vérifie si un rôle donné a accès à une route requise.
 * À utiliser uniquement côté client pour l'affichage conditionnel.
 * Le contrôle réel doit toujours être effectué côté serveur (RLS + middleware).
 */
export function hasRoleAccess(userRole, requiredRole) {
  const hierarchy = {
    [ROLES.USER]: 0,
    [ROLES.MODERATOR]: 1,
    [ROLES.AGENT]: 2,
    [ROLES.ADMIN]: 3,
    [ROLES.SUPER_ADMIN]: 4,
  };

  const userLevel = hierarchy[userRole] || 0;
  const requiredLevel = hierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

export default { ROLES, ROLE_LABELS, hasRoleAccess };
