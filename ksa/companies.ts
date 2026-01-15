/**
 * Companies KSA - Knowledge, Skills, and Abilities
 *
 * Enrich and lookup company information including:
 * - Domain/website enrichment
 * - Company search
 * - Industry classification
 * - Employee counts, funding, tech stack
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface Company {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  employeeCount?: number;
  employeeRange?: string;
  foundedYear?: number;
  headquarters?: {
    city?: string;
    state?: string;
    country?: string;
  };
  socialProfiles?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  funding?: {
    total?: number;
    lastRound?: string;
    lastRoundDate?: string;
  };
  techStack?: string[];
  revenue?: string;
  type?: string;
}

export interface CompanySearchResult {
  companies: Company[];
  total: number;
}

export interface DomainInfo {
  domain: string;
  company?: Company;
  isValid: boolean;
  technologies?: string[];
  dns?: {
    mx?: string[];
    txt?: string[];
  };
}

// ============================================================================
// Enrichment Functions
// ============================================================================

/**
 * Enrich a domain with company information.
 *
 * @param domain - Company domain (e.g., 'stripe.com')
 * @returns Enriched company data
 *
 * @example
 * const company = await enrichDomain('stripe.com');
 * console.log(`${company.name}: ${company.employeeRange} employees`);
 * console.log(`Industry: ${company.industry}`);
 */
export async function enrichDomain(domain: string): Promise<Company> {
  const data = await callGateway<any>("services.TheCompanies.internal.call", {
    path: "/v2/companies/by-domain",
    params: { domain },
  });
  return mapCompany(data);
}

/**
 * Enrich a company by name.
 *
 * @param name - Company name
 * @returns Enriched company data
 *
 * @example
 * const company = await enrichCompany('Stripe');
 * console.log(`Domain: ${company.domain}`);
 * console.log(`Founded: ${company.foundedYear}`);
 */
export async function enrichCompany(name: string): Promise<Company> {
  const data = await callGateway<any>("services.TheCompanies.internal.call", {
    path: "/v2/companies/by-name",
    params: { name },
  });
  return mapCompany(data);
}

/**
 * Bulk enrich multiple domains.
 *
 * @param domains - Array of domains to enrich
 * @returns Array of enriched companies
 *
 * @example
 * const companies = await bulkEnrich(['stripe.com', 'notion.so', 'figma.com']);
 * for (const c of companies) {
 *   console.log(`${c.name}: ${c.industry}`);
 * }
 */
export async function bulkEnrich(domains: string[]): Promise<Company[]> {
  const results: Company[] = [];
  // Process in batches to avoid rate limits
  for (const domain of domains) {
    try {
      const company = await enrichDomain(domain);
      results.push(company);
    } catch (error) {
      // Continue with other domains if one fails
      results.push({
        name: domain,
        domain,
        description: `Failed to enrich: ${error}`,
      });
    }
  }
  return results;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search for companies by various criteria.
 *
 * @param options - Search options
 * @returns Search results with companies
 *
 * @example
 * const results = await searchCompanies({
 *   industry: 'SaaS',
 *   employeeMin: 50,
 *   employeeMax: 500,
 *   country: 'US'
 * });
 * for (const c of results.companies) {
 *   console.log(`${c.name} (${c.domain}): ${c.employeeRange}`);
 * }
 */
export async function searchCompanies(options: {
  query?: string;
  industry?: string;
  country?: string;
  state?: string;
  city?: string;
  employeeMin?: number;
  employeeMax?: number;
  revenueMin?: string;
  revenueMax?: string;
  techStack?: string[];
  limit?: number;
  page?: number;
}): Promise<CompanySearchResult> {
  const params: Record<string, any> = {
    size: options.limit || 25,
    page: options.page || 1,
  };

  if (options.query) params.q = options.query;
  if (options.industry) params.industry = options.industry;
  if (options.country) params.country = options.country;
  if (options.state) params.state = options.state;
  if (options.city) params.city = options.city;
  if (options.employeeMin) params.employees_min = options.employeeMin;
  if (options.employeeMax) params.employees_max = options.employeeMax;
  if (options.techStack?.length) params.technologies = options.techStack.join(",");

  const data = await callGateway<any>("services.TheCompanies.internal.call", {
    path: "/v2/companies/search",
    params,
  });

  const companies = (data.companies || data.data || []).map(mapCompany);
  return {
    companies,
    total: data.total || companies.length,
  };
}

/**
 * Find similar companies to a given domain.
 *
 * @param domain - Reference company domain
 * @param limit - Maximum results (default: 10)
 * @returns Similar companies
 *
 * @example
 * const similar = await findSimilar('stripe.com', 5);
 * for (const c of similar) {
 *   console.log(`${c.name}: ${c.description?.slice(0, 50)}`);
 * }
 */
export async function findSimilar(domain: string, limit = 10): Promise<Company[]> {
  const data = await callGateway<any>("services.TheCompanies.internal.call", {
    path: "/v2/companies/similar",
    params: { domain, size: limit },
  });
  return (data.companies || data.data || []).map(mapCompany);
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Get companies using a specific technology.
 *
 * @param technology - Technology name (e.g., 'React', 'Stripe', 'AWS')
 * @param options - Additional filters
 * @returns Companies using the technology
 *
 * @example
 * const companies = await companiesByTech('Stripe', { country: 'US', limit: 20 });
 * console.log(`Found ${companies.length} companies using Stripe`);
 */
export async function companiesByTech(
  technology: string,
  options?: {
    country?: string;
    employeeMin?: number;
    limit?: number;
  }
): Promise<Company[]> {
  return (
    await searchCompanies({
      techStack: [technology],
      country: options?.country,
      employeeMin: options?.employeeMin,
      limit: options?.limit,
    })
  ).companies;
}

/**
 * Get company tech stack.
 *
 * @param domain - Company domain
 * @returns Array of technologies used
 *
 * @example
 * const tech = await getTechStack('stripe.com');
 * console.log('Technologies:', tech.join(', '));
 */
export async function getTechStack(domain: string): Promise<string[]> {
  const company = await enrichDomain(domain);
  return company.techStack || [];
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapCompany(data: any): Company {
  if (!data) return { name: "Unknown", domain: "" };

  return {
    name: data.name || data.company_name || "",
    domain: data.domain || data.website || "",
    description: data.description || data.short_description,
    industry: data.industry || data.primary_industry,
    employeeCount: data.employee_count || data.employees,
    employeeRange: data.employee_range || data.employees_range,
    foundedYear: data.founded_year || data.year_founded,
    headquarters: data.headquarters || {
      city: data.city,
      state: data.state,
      country: data.country,
    },
    socialProfiles: {
      linkedin: data.linkedin_url || data.linkedin,
      twitter: data.twitter_url || data.twitter,
      facebook: data.facebook_url || data.facebook,
    },
    funding: data.funding
      ? {
          total: data.funding.total_funding || data.total_funding,
          lastRound: data.funding.last_round_type || data.last_funding_type,
          lastRoundDate: data.funding.last_round_date || data.last_funding_date,
        }
      : undefined,
    techStack: data.technologies || data.tech_stack || [],
    revenue: data.revenue || data.estimated_revenue,
    type: data.company_type || data.type,
  };
}
