import { getTenantBySlug } from '../database.js';
import config from '../config.js';

/**
 * Tenant Resolution Middleware
 * 
 * Resolves the current tenant from the request subdomain or header.
 * Example: firm-a.broadcast.innodify.in → slug = "firm-a"
 * 
 * Injects into request:
 *   - req.tenant   → Full tenant object from DB
 *   - req.tenantId → Shorthand for tenant.id (used in queries)
 */
export const resolveTenant = async (req, res, next) => {
  try {
    const host = req.hostname;
    let slug;

    if (config.nodeEnv === 'development') {
      slug = req.headers['x-tenant-slug'] || 'default';
    } else {
      // In production, use header (sent by frontend) or extract subdomain
      slug = req.headers['x-tenant-slug'] || null;
      if (!slug) {
        const parts = host.split('.');
        // Only use subdomain for 4+ part hostnames (firm.broadcast.innodify.in)
        // broadcast.innodify.in is the app domain, not a tenant
        if (parts.length >= 4) {
          slug = parts[0];
        }
      }
    }

    // Skip tenant resolution for super admin panel
    if (slug === 'admin' || slug === 'api') {
      req.tenant = null;
      req.tenantId = null;
      return next();
    }

    // If no slug resolved, continue without tenant — JWT auth will set tenantId
    if (!slug) {
      req.tenant = null;
      req.tenantId = null;
      return next();
    }

    // Look up tenant from cache/DB
    const tenant = await getTenantBySlug(slug);

    if (!tenant) {
      // Don't block — JWT auth middleware will resolve tenantId from token
      req.tenant = null;
      req.tenantId = null;
      return next();
    }

    // Check subscription status
    if (tenant.subscription_status === 'expired') {
      return res.status(403).json({
        error: 'Your subscription has expired. Please renew to continue.',
        subscription_expired: true,
      });
    }

    if (tenant.subscription_status === 'cancelled') {
      return res.status(403).json({
        error: 'This account has been deactivated.',
      });
    }

    // Check trial expiry
    if (tenant.subscription_plan === 'trial' && tenant.trial_ends_at) {
      const trialEnd = new Date(tenant.trial_ends_at);
      if (trialEnd < new Date()) {
        return res.status(403).json({
          error: 'Your free trial has ended. Choose a plan to continue.',
          trial_expired: true,
        });
      }
    }

    // Inject tenant into request
    req.tenant = tenant;
    req.tenantId = tenant.id;

    next();
  } catch (error) {
    console.error('Tenant resolution error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Super Admin Only Middleware
 */
export const superAdminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const superAdminEmails = config.superAdminEmails || [];

  if (!superAdminEmails.includes(req.user.email)) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};
