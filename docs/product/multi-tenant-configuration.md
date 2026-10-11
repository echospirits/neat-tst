# Tenant configuration

Existing Organization, User.organizationId/role, feature registry, products, branding, tags, data sources and Support View remain authoritative. Configuration is extended in Organization.crmPreferences for relationship thresholds, visit guides, detailed Pipeline stages, account categories/custom fields, teams and territories. Separate credential models hold mail, SMS and Eventbrite connections with tenant ownership and encryption.

Account profile data lives on OrganizationAccountOverlay, leaving shared directory names/external identifiers and source imports intact. Parent references are validated and checked for cycles. Custom text/number/date/boolean values preserve null, zero and false. Removing a field hides it while retaining prior values; deleting assigned territories/teams/categories is rejected. Active team/territory owners must belong to the organization. Teams do not grant new privileges.

Organization Setup owns reusable playbooks and AI opt-in. User Communications owns mailbox consent and sending-identity setup. Recipe approval/public sharing is explicitly reviewed. Geography is a suggestion until an account is assigned; no boundary polygon or ownership is inferred automatically.
