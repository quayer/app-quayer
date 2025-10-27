# 🧪 Testing Checklist - Onboarding & Organization Management

## ✅ Setup Complete

- ✅ Database running (PostgreSQL + Redis via Docker)
- ✅ Schema synced with `prisma db push`
- ✅ Prisma Client generated
- ✅ Development server running at **http://localhost:3000**

---

## 📋 Test Scenarios

### **Test 1: Onboarding Flow (New User Signup)**

#### Objective
Verify that new users without organizations are redirected to onboarding and can complete the setup process.

#### Steps
1. **Sign Up New User**
   - Navigate to: `http://localhost:3000/signup`
   - Enter email: `test-onboarding@example.com`
   - Enter name: `Test Onboarding User`
   - Complete passwordless signup (OTP verification)

2. **Verify Onboarding Redirect**
   - After signup, user should be automatically redirected to `/onboarding`
   - Verify the onboarding page displays correctly

3. **Complete Onboarding Form**
   - Fill in organization details:
     - **Organization Name**: "Test Company"
     - **Organization Type**: Select "Pessoa Jurídica (CNPJ)"
     - **CNPJ**: "12.345.678/0001-90"
     - **Business Hours Start**: "09:00"
     - **Business Hours End**: "18:00"
     - **Business Days**: Select Mon-Fri (1,2,3,4,5)
     - **Timezone**: "America/Sao_Paulo"
   - Click "Concluir e Começar"

4. **Verify Success**
   - ✅ Toast success message appears
   - ✅ User is redirected to `/integracoes` dashboard
   - ✅ User is linked as `master` role in the new organization

#### Expected Database State
```sql
-- Organization created with:
SELECT * FROM "Organization" WHERE name = 'Test Company';
-- Should show businessHoursStart, businessHoursEnd, businessDays, timezone

-- User updated with:
SELECT onboardingCompleted, currentOrgId FROM "User"
WHERE email = 'test-onboarding@example.com';
-- onboardingCompleted = true, currentOrgId should be set

-- UserOrganization relation created:
SELECT * FROM "UserOrganization" WHERE role = 'master';
-- User should be linked with master role
```

---

### **Test 2: Organization Switcher (GOD/Admin Users)**

#### Objective
Verify that admin users can switch between organizations using the organization switcher in the user menu.

#### Prerequisites
- Create a GOD/admin user (first user in system, or user with role='admin')
- Create at least 2 organizations in the database

#### Steps
1. **Login as Admin User**
   - Navigate to: `http://localhost:3000/login`
   - Login with admin credentials
   - Verify you land on `/admin` dashboard

2. **Open Organization Switcher**
   - Click on the user avatar/name in the sidebar (bottom-left)
   - Verify dropdown menu opens
   - Verify "Contexto Administrativo" section is visible (GOD only)
   - Verify current organization name is displayed

3. **Test Organization Search**
   - Click on the organization switcher item
   - Modal should open with "Trocar Organização" title
   - Type organization name in search field
   - Verify filtered results appear

4. **Switch Organization**
   - Select a different organization from the list
   - Click on the organization button
   - Verify:
     - ✅ Toast success message appears
     - ✅ Page refreshes
     - ✅ New organization context is active
     - ✅ Access token is updated in localStorage

5. **Verify Current Organization Badge**
   - Reopen organization switcher
   - Verify the current organization has "Atual" badge
   - Verify it's highlighted with secondary variant

#### Expected Behavior
- Non-admin users should NOT see "Contexto Administrativo" section
- Admin users can switch to ANY organization (even if not a member)
- Current organization is persisted in `User.currentOrgId`
- New JWT token includes updated `currentOrgId` and `organizationRole`

---

### **Test 3: Organization Settings Page**

#### Objective
Verify role-based permissions and editing capabilities on the organization settings page.

#### Test 3A: Master/Owner Access (Full Edit Rights)

**Steps:**
1. Login as organization master (the user who created the organization)
2. Navigate to: `http://localhost:3000/organizacao`
3. Verify page displays:
   - ✅ "Master" badge in header
   - ✅ All fields are EDITABLE (name, business hours)
   - ✅ Document, slug, type fields are READ-ONLY with gray background
   - ✅ Plan limits section displays correctly
   - ✅ "Salvar Alterações" button is visible

4. Edit Organization Details:
   - Change organization name
   - Update business hours (e.g., "08:00" to "20:00")
   - Change business days selection
   - Click "Salvar Alterações"

5. Verify:
   - ✅ Toast success message appears
   - ✅ Changes are persisted to database
   - ✅ Page data refreshes with new values

#### Test 3B: GOD/Admin Access (Full Edit Rights)

**Steps:**
1. Login as GOD/admin user
2. Switch to any organization using organization switcher
3. Navigate to: `http://localhost:3000/organizacao`
4. Verify:
   - ✅ "GOD" badge in header
   - ✅ All editable fields are ENABLED
   - ✅ Can save changes successfully

#### Test 3C: Manager Access (Read-Only)

**Steps:**
1. Create a user with `organizationRole = 'manager'`
2. Login as that user
3. Navigate to: `http://localhost:3000/organizacao`
4. Verify:
   - ✅ "Manager" badge in header
   - ✅ Alert message: "Você está visualizando em modo somente leitura"
   - ✅ All fields are DISABLED (cannot edit)
   - ✅ "Salvar Alterações" button is NOT visible

#### Test 3D: Regular User Access (Read-Only)

**Steps:**
1. Create a user with `organizationRole = 'user'`
2. Login as that user
3. Navigate to: `http://localhost:3000/organizacao`
4. Verify:
   - ✅ "User" badge in header
   - ✅ Read-only alert is displayed
   - ✅ Cannot edit any fields
   - ✅ No save button

---

## 🔧 Troubleshooting

### Issue: "Organization not found" on `/organizacao`
**Solution:** Ensure the user has `currentOrgId` set in their User record.

### Issue: Onboarding page not redirecting after completion
**Solution:** Check browser console for errors. Verify `accessToken` is being saved to localStorage.

### Issue: Organization switcher shows no organizations
**Solution:** Verify the `organizations.list.query()` endpoint is working. Check if user is actually admin (`role = 'admin'`).

### Issue: Migration errors
**Solution:** Use `npx prisma db push` instead of `migrate dev` if starting fresh.

---

## 🎯 Success Criteria

All tests pass when:
- ✅ New users complete onboarding successfully
- ✅ Admin users can switch organizations
- ✅ Role-based permissions work correctly on organization settings page
- ✅ All CRUD operations persist to database
- ✅ No console errors during testing
- ✅ JWT tokens update correctly with organization context

---

## 📊 Database Verification Queries

```sql
-- Check onboarding completion
SELECT email, name, onboardingCompleted, currentOrgId
FROM "User"
ORDER BY createdAt DESC
LIMIT 5;

-- Check organization with business hours
SELECT id, name, slug, businessHoursStart, businessHoursEnd, businessDays, timezone
FROM "Organization"
ORDER BY createdAt DESC;

-- Check user-organization relationships
SELECT u.email, o.name as organization, uo.role
FROM "UserOrganization" uo
JOIN "User" u ON u.id = uo.userId
JOIN "Organization" o ON o.id = uo.organizationId
WHERE uo.isActive = true;

-- Check for GOD/admin users
SELECT id, email, name, role, currentOrgId
FROM "User"
WHERE role = 'admin';
```

---

## 🚀 Quick Test Commands

```bash
# Check server logs
npm run dev

# Access Prisma Studio (GUI for database)
npx prisma studio

# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# View database schema
npx prisma db pull
```

---

## 📝 Test Results

Document your test results here:

### Test 1: Onboarding Flow
- [ ] New user signup
- [ ] Redirect to /onboarding
- [ ] Form validation
- [ ] Organization creation
- [ ] User role assignment
- [ ] Redirect to dashboard

### Test 2: Organization Switcher
- [ ] GOD user sees switcher
- [ ] Non-admin users don't see switcher
- [ ] Search/filter organizations
- [ ] Switch organization
- [ ] Token refresh
- [ ] Current org badge

### Test 3: Organization Settings
- [ ] Master can edit
- [ ] GOD can edit
- [ ] Manager read-only
- [ ] User read-only
- [ ] Changes persist
- [ ] Read-only fields disabled

---

**Testing Started:** ____________________
**Testing Completed:** ____________________
**Tested By:** ____________________
**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Completed
