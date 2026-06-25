import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToCsv } from '../src/utils/exportToCsv.js';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã°Å¸Â§Å  BROWSER MOCKS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
global.Blob = vi.fn().mockImplementation((content, options) => ({ content, options }));
global.URL = {
  createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: vi.fn(),
};
global.document = {
  createElement: vi.fn().mockReturnValue({
    style: {},
    setAttribute: vi.fn(),
    click: vi.fn(),
  }),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
};

describe('Admin Logic: exportToCsv Utility', () => {
    
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã°Å¸Â§Âª SUCCESS SCENARIOS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    it('Scenario 1: Calculates exactly 2.5% commission correctly', () => {
        const rows = [
            { booking_ref: 'REF001', amount_paid: 10000, full_name: 'Test Guest' }
        ];
        
        // Use a mock to capture the CSV content
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);

        // Commission of 10,000 should be 250.00
        expect(capturedContent).toContain('"250.00"');
    });

    it('Scenario 2: Sanitizes guest names with quotes', () => {
        const rows = [
            { booking_ref: 'REF002', amount_paid: 5000, full_name: 'O\'Connor "Special" Guest' }
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);

        // Quotes should be doubled in CSV
        expect(capturedContent).toContain('"O\'Connor ""Special"" Guest"');
    });

    it('Scenario 3: Formats stay window correctly', () => {
        const rows = [
            { check_in: '2026-01-01', check_out: '2026-01-05' }
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);
        expect(capturedContent).toContain('"2026-01-01 TO 2026-01-05"');
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã°Å¸Â§Âª FAILURE SCENARIOS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    it('Scenario 4: Returns immediately if rows are empty or undefined', () => {
        const spy = vi.spyOn(document, 'createElement');
        exportToCsv('test', []);
        expect(spy).not.toHaveBeenCalled();
        
        exportToCsv('test', null);
        expect(spy).not.toHaveBeenCalled();
    });

    it('Scenario 5: Handles null/missing fields without crashing', () => {
        const rows = [
            { booking_ref: null, amount_paid: undefined, full_name: '' }
        ];
        expect(() => exportToCsv('test', rows)).not.toThrow();
    });

    it('Scenario 6: Marks stay as N/A if dates are missing', () => {
        const rows = [
            { booking_ref: 'REF003', amount_paid: 1000 }
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);
        expect(capturedContent).toContain('"N/A"');
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã°Å¸Â§Âª SECURITY SCENARIOS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    it('Scenario 7: Does not include internal fields like password or tokens', () => {
        const rows = [
            { booking_ref: 'REF004', password: 'secret_leak', amount_paid: 1000 }
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);
        expect(capturedContent).not.toContain('secret_leak');
    });

    it('Scenario 8: Correctly identifies "Web Portal" vs "Admin" source', () => {
        const rows = [
            { created_by: 'admin' },
            { created_by: 'portal' }
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);
        expect(capturedContent).toContain('"Admin"');
        expect(capturedContent).toContain('"Web Portal"');
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã°Å¸Â§Âª EDGE CASE SCENARIOS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    it('Scenario 9: Handles 0.00 gross amount and commission', () => {
        const rows = [
            { amount_paid: 0 }
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);
        expect(capturedContent).toContain('"0"');
        expect(capturedContent).toContain('"0.00"');
    });

    it('Scenario 10: Handles large millions in gross and commission', () => {
        const rows = [
            { amount_paid: 10000000 } // 10 Million
        ];
        
        let capturedContent = '';
        global.Blob.mockImplementationOnce((content) => {
            capturedContent = content[0];
            return {};
        });

        exportToCsv('test', rows);
        expect(capturedContent).toContain('"250000.00"'); // 2.5% of 10M is 250k
    });

});
