/**
 * Compatibilité : toutes les pages importent encore `../hooks/useAuth`.
 * L'implémentation vit désormais dans le contexte partagé (context/AuthContext.jsx).
 */
export { useAuth, default } from '../context/AuthContext';
