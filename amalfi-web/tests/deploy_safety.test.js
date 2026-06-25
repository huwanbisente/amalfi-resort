import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve('..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Production deploy safety', () => {
    it('keeps local runtime data out of simple patch bundles', () => {
        const script = readRepoFile('amalfi-ops/deploy/simple-patch.ps1');

        expect(script).not.toContain('"amalfi-system/runtime/hub/database.sqlite"');
        expect(script).not.toMatch(/rm -rf .*amalfi-system(?!\/intelligence)/);
        expect(script).toContain('amalfi-system/intelligence');
        expect(script).toContain('amalfi-system/intelligence');
    });

    it('keeps full deploy code refresh separate from runtime data reset', () => {
        const script = readRepoFile('amalfi-ops/deploy/full-deploy.ps1');

        expect(script).toContain('--exclude="amalfi-system/runtime"');
        expect(script).toContain('preserving runtime');
        expect(script).not.toContain('rm -rf $REMOTE_ROOT/*');
    });

    it('makes production runtime persistence explicit in compose', () => {
        const compose = readRepoFile('docker-compose.prod.yml');

        expect(compose).toContain('./shared/runtime/hub:/runtime/hub');
        expect(compose).toContain('./shared/runtime/chatbot:/runtime/chatbot');
        expect(compose).toContain('CHATBOT_LOG_FILE=/runtime/chatbot/logs/chat_archive.csv');
        expect(compose).toContain('CHATBOT_STATE_DB=/runtime/chatbot/chatbot_state.sqlite');
    });
});
