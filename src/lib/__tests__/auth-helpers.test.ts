import { canEditProject, canDeleteProject } from '../auth-helpers';

describe('Auth Helpers', () => {
    describe('canEditProject', () => {
        it('should allow ADMIN', () => {
            expect(canEditProject('ADMIN')).toBe(true);
        });

        it('should allow PROJECT_LEADER', () => {
            expect(canEditProject('PROJECT_LEADER')).toBe(true);
        });

        it('should allow member PROJECT_LEADER', () => {
            expect(canEditProject('USER', 'PROJECT_LEADER')).toBe(true);
        });

        it('should allow member USER', () => {
            expect(canEditProject('USER', 'USER')).toBe(true);
        });

        it('should deny READER', () => {
            expect(canEditProject('USER', 'READER')).toBe(false); // Wait, check implementation
            // Implementation: return memberRole === "PROJECT_LEADER" || memberRole === "USER";
            // So if memberRole is READER, it returns false. Correct.
        });
    });

    describe('canDeleteProject', () => {
        it('should allow ADMIN', () => {
            expect(canDeleteProject('ADMIN')).toBe(true);
        });

        it('should allow PROJECT_LEADER', () => {
            expect(canDeleteProject('PROJECT_LEADER')).toBe(true);
        });

        it('should deny USER', () => {
            expect(canDeleteProject('USER')).toBe(false);
        });
    });
});
