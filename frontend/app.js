// frontend/app.js

document.addEventListener('DOMContentLoaded', () => {
    // Auto-detect API URL based on environment
    // Local development: http://127.0.0.1:8787
    // Production: Replace with your actual worker URL
    const API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://127.0.0.1:8787';
        }
        // TODO: Replace 'your-subdomain' with your actual Cloudflare Workers subdomain
        // Example: https://osrs-hiscores-clone.alex-md.workers.dev
        return ' https://osrs-hiscores-clone.vs.workers.dev';
    })();

    // DOM Element References
    const mainContent = document.getElementById('main-content');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const leaderboardViewEl = document.getElementById('leaderboard-view');
    const leaderboardBodyEl = document.getElementById('leaderboard-body');
    const userDetailViewEl = document.getElementById('user-detail-view');

    /**
     * A simple router that checks the URL hash to decide what to render.
     */
    const handleRouteChange = () => {
        const hash = window.location.hash.substring(1); // Remove the '#'
        if (hash) {
            // If there's a hash, assume it's a username and fetch their stats
            fetchUserStats(decodeURIComponent(hash));
        } else {
            // Otherwise, show the main leaderboard
            fetchLeaderboard();
        }
    };

    /**
     * Hides all views and shows the specified one.
     * @param {'loading' | 'error' | 'leaderboard' | 'userDetail'} viewName 
     */
    const showView = (viewName) => {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'none';
        leaderboardViewEl.style.display = 'none';
        userDetailViewEl.style.display = 'none';

        switch (viewName) {
            case 'loading':
                loadingEl.style.display = 'block';
                break;
            case 'error':
                errorEl.style.display = 'block';
                break;
            case 'leaderboard':
                leaderboardViewEl.style.display = 'block';
                break;
            case 'userDetail':
                userDetailViewEl.style.display = 'block';
                break;
        }
    };

    /**
     * Fetches and renders the main leaderboard.
     */
    const fetchLeaderboard = async () => {
        showView('loading');
        try {
            const response = await fetch(`${API_BASE_URL}/api/leaderboard`);
            if (!response.ok) {
                throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
            }
            const leaderboardData = await response.json();
            renderLeaderboard(leaderboardData);
            showView('leaderboard');
        } catch (error) {
            console.error(error);
            errorEl.textContent = `Error: ${error.message}`;
            showView('error');
        }
    };

    /**
     * Fetches and renders a single user's detailed stats.
     * @param {string} username 
     */
    const fetchUserStats = async (username) => {
        showView('loading');
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(username)}`);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`User "${username}" not found.`);
                }
                throw new Error(`Failed to fetch user data: ${response.statusText}`);
            }
            const userData = await response.json();
            renderUserDetail(userData);
            showView('userDetail');
        } catch (error) {
            console.error(error);
            errorEl.textContent = `Error: ${error.message}`;
            showView('error');
        }
    };

    /**
     * Renders the leaderboard table from the fetched data.
     * @param {Array} data 
     */
    const renderLeaderboard = (data) => {
        leaderboardBodyEl.innerHTML = ''; // Clear previous data
        if (!data || data.length === 0) {
            leaderboardBodyEl.innerHTML = '<tr><td colspan="4">No players on the leaderboard yet.</td></tr>';
            return;
        }
        data.forEach(player => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${player.rank}</td>
                <td><a href="#${encodeURIComponent(player.username)}">${player.username}</a></td>
                <td>${player.totalLevel.toLocaleString()}</td>
                <td>${player.totalXp.toLocaleString()}</td>
            `;
            leaderboardBodyEl.appendChild(row);
        });
    };

    /**
     * Renders the detailed stats view for a single user.
     * @param {object} user 
     */
    const renderUserDetail = (user) => {
        userDetailViewEl.innerHTML = ''; // Clear previous data

        const totalLevel = Object.values(user.skills).reduce((sum, s) => sum + s.level, 0);
        const totalXp = Object.values(user.skills).reduce((sum, s) => sum + s.xp, 0);

        let html = `
            <div class="user-header">
                <h2>Stats for ${user.username}</h2>
                <a href="#" class="back-link">← Back to Leaderboard</a>
            </div>
            <table class="hiscores-table user-stats-table">
                <thead>
                    <tr>
                        <th>Skill</th>
                        <th>Level</th>
                        <th>XP</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Overall</strong></td>
                        <td><strong>${totalLevel.toLocaleString()}</strong></td>
                        <td><strong>${totalXp.toLocaleString()}</strong></td>
                    </tr>
        `;

        for (const skillName in user.skills) {
            const skill = user.skills[skillName];
            html += `
                <tr>
                    <td>${skillName}</td>
                    <td>${skill.level}</td>
                    <td>${skill.xp.toLocaleString()}</td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        userDetailViewEl.innerHTML = html;
    };

    // Listen for hash changes (e.g., clicking a user link or using browser back/forward)
    window.addEventListener('hashchange', handleRouteChange);

    // Initial load
    handleRouteChange();
});
