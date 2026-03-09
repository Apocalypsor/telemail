Perform an iterative code review and fix cycle on this codebase. Repeat the following loop until you are confident there are no remaining issues:

1. **Review**: Use an Explore agent to thoroughly check the codebase for:
   - Bugs and logic errors
   - Security vulnerabilities (SQL injection, XSS, CSRF, auth bypass, information disclosure)
   - Type mismatches and TypeScript errors
   - Consistency issues (types, imports, naming conventions)
   - Missing input validation
   - Dead code and unused imports
   - Edge cases in access control

2. **Fix**: For each issue found, fix it directly. After fixing, run `npx tsc --noEmit` to verify TypeScript still compiles clean.

3. **Verify**: Check that your fixes didn't introduce new problems. If new issues are found, go back to step 2.

4. **Report**: When no more issues are found, report a summary to the user listing:
   - Issues found and fixed (with file paths and line numbers)
   - Issues reviewed but intentionally left as-is (with justification)
   - Final TypeScript compilation status

Continue the loop until a full review pass finds zero issues. Be thorough but avoid over-engineering - only fix real problems, not style preferences.
