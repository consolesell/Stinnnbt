document.addEventListener('DOMContentLoaded', function() {
    const useDefaultCredentials = document.getElementById('use-default-credentials');
    const customCredentials = document.getElementById('custom-credentials');
    const takeProfitCheck = document.getElementById('take-profit-check');
    const takeProfitInput = document.getElementById('take-profit');
    const stopLossCheck = document.getElementById('stop-loss-check');
    const stopLossInput = document.getElementById('stop-loss');
    const submitBtn = document.getElementById('submit-btn');
    const connectBtn = document.getElementById('connect-btn');
    let ws;

    // Load saved configuration
    const savedConfig = localStorage.getItem('config');
    if (savedConfig) {
        const config = JSON.parse(savedConfig);
        useDefaultCredentials.checked = config.useDefault;
        if (!config.useDefault) {
            document.getElementById('app-id').value = config.appId;
            document.getElementById('token').value = config.token;
            customCredentials.style.display = 'block';
        }
        takeProfitCheck.checked = config.takeProfit !== null;
        takeProfitInput.value = config.takeProfit || '';
        takeProfitInput.disabled = !takeProfitCheck.checked;
        stopLossCheck.checked = config.stopLoss !== null;
        stopLossInput.value = config.stopLoss || '';
        stopLossInput.disabled = !stopLossCheck.checked;
        document.getElementById('high-tolerance').checked = config.highTolerance;
        document.getElementById('low-tolerance').checked = config.lowTolerance;
    }

    // Event listeners
    useDefaultCredentials.addEventListener('change', function() {
        customCredentials.style.display = this.checked ? 'none' : 'block';
    });

    takeProfitCheck.addEventListener('change', function() {
        takeProfitInput.disabled = !this.checked;
    });

    stopLossCheck.addEventListener('change', function() {
        stopLossInput.disabled = !this.checked;
    });

    submitBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const config = {
            useDefault: useDefaultCredentials.checked,
            appId: useDefaultCredentials.checked ? '1089' : document.getElementById('app-id').value,
            token: useDefaultCredentials.checked ? 'pfm6nudgLi4aNys' : document.getElementById('token').value,
            takeProfit: takeProfitCheck.checked ? parseFloat(takeProfitInput.value) : null,
            stopLoss: stopLossCheck.checked ? parseFloat(stopLossInput.value) : null,
            highTolerance: document.getElementById('high-tolerance').checked,
            lowTolerance: document.getElementById('low-tolerance').checked
        };
        localStorage.setItem('config', JSON.stringify(config));
        alert('Configuration saved');
    });

    connectBtn.addEventListener('click', startBot);

    // Chart setup
    const ctx = document.getElementById('pl-chart').getContext('2d');
    const plChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Total P/L',
                data: [],
                borderColor: '#3498db',
                fill: false
            }]
        },
        options: {
            scales: { x: { type: 'time', time: { unit: 'second' } } }
        }
    });

    const activeContracts = {};

    function startBot() {
        const config = JSON.parse(localStorage.getItem('config'));
        if (!config) {
            alert('Please save configuration first');
            return;
        }
        ws = new WebSocket(`wss://ws.deriv.com/websockets/v3?app_id=${config.appId}`);

        ws.onopen = function() {
            ws.send(JSON.stringify({ authorize: config.token }));
        };

        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.authorize) {
                if (data.error) {
                    alert('Authentication failed: ' + data.error.message);
                } else {
                    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                    ws.send(JSON.stringify({ portfolio: 1 }));
                }
            } else if (data.balance) {
                document.getElementById('balance-display').textContent = `${data.balance.currency} ${data.balance.balance}`;
            } else if (data.portfolio) {
                handlePortfolio(data.portfolio);
            } else if (data.proposal_open_contract) {
                handleContractUpdate(data.proposal_open_contract);
            } else if (data.sell) {
                if (!data.error) {
                    delete activeContracts[data.sell.contract_id];
                    removeContractFromUI(data.sell.contract_id);
                }
            }
        };

        ws.onclose = function() {
            setTimeout(startBot, 5000);
        };
    }

    function handlePortfolio(portfolio) {
        const contracts = portfolio.contracts || [];
        const statusMessage = document.getElementById('status-message');
        if (contracts.length === 0) {
            statusMessage.style.display = 'block';
            setTimeout(() => ws.send(JSON.stringify({ portfolio: 1 })), 5000);
        } else {
            statusMessage.style.display = 'none';
            contracts.forEach(contract => {
                if (!activeContracts[contract.contract_id]) {
                    activeContracts[contract.contract_id] = {
                        ...contract,
                        plHistory: [],
                        startTime: new Date(contract.date_start * 1000)
                    };
                    ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contract.contract_id, subscribe: 1 }));
                    addContractToUI(contract);
                }
            });
        }
    }

    function handleContractUpdate(contract) {
        if (contract.status === 'open') {
            const currentPL = parseFloat(contract.profit) || 0;
            activeContracts[contract.contract_id] = {
                ...activeContracts[contract.contract_id],
                ...contract,
                plHistory: [...(activeContracts[contract.contract_id].plHistory || []), { time: new Date(), pl: currentPL }]
            };
            if (activeContracts[contract.contract_id].plHistory.length > 10) {
                activeContracts[contract.contract_id].plHistory.shift();
            }
            updateContractInUI(contract);
            updateTotalPL();
            decideToSell(contract);
        } else {
            saveContractData(contract);
            delete activeContracts[contract.contract_id];
            removeContractFromUI(contract.contract_id);
        }
    }

    function addContractToUI(contract) {
        const contractDiv = document.createElement('div');
        contractDiv.id = `contract-${contract.contract_id}`;
        contractDiv.innerHTML = `
            <p>Contract ID: ${contract.contract_id}</p>
            <p>Type: ${contract.contract_type}</p>
            <p>P/L: <span id="pl-${contract.contract_id}">0</span></p>
            <p>Duration: <span id="duration-${contract.contract_id}">0s</span></p>
        `;
        document.getElementById('contracts-list').appendChild(contractDiv);
    }

    function updateContractInUI(contract) {
        const plSpan = document.getElementById(`pl-${contract.contract_id}`);
        const durationSpan = document.getElementById(`duration-${contract.contract_id}`);
        if (plSpan && durationSpan) {
            plSpan.textContent = contract.profit || 0;
            const duration = Math.floor((new Date() - activeContracts[contract.contract_id].startTime) / 1000);
            durationSpan.textContent = `${Math.floor(duration / 60)}m ${duration % 60}s`;
        }
    }

    function removeContractFromUI(contractId) {
        const contractDiv = document.getElementById(`contract-${contractId}`);
        if (contractDiv) contractDiv.remove();
    }

    function updateTotalPL() {
        let totalPL = 0;
        for (const contract of Object.values(activeContracts)) {
            totalPL += parseFloat(contract.profit) || 0;
        }
        const now = new Date();
        plChart.data.labels.push(now);
        plChart.data.datasets[0].data.push(totalPL);
        plChart.update();
    }

    function decideToSell(contract) {
        const config = JSON.parse(localStorage.getItem('config'));
        const pl = parseFloat(contract.profit) || 0;
        const plHistory = activeContracts[contract.contract_id].plHistory;
        if (plHistory.length < 2) return;

        const mean = plHistory.reduce((sum, entry) => sum + entry.pl, 0) / plHistory.length;
        const variance = plHistory.reduce((sum, entry) => sum + Math.pow(entry.pl - mean, 2), 0) / plHistory.length;
        const volatility = Math.sqrt(variance);

        if (config.takeProfit && pl >= config.takeProfit) {
            if (config.highTolerance && volatility < 10) return; // Wait if high tolerance and low volatility
            sellContract(contract.contract_id, 'Take profit reached');
        } else if (config.stopLoss && pl <= config.stopLoss) {
            sellContract(contract.contract_id, 'Stop loss reached');
        } else if (config.lowTolerance && pl > 0 && volatility > 5) {
            sellContract(contract.contract_id, 'Safe exit due to volatility');
        }
    }

    function sellContract(contractId, reason) {
        ws.send(JSON.stringify({ sell: contractId, price: 0 }));
        const notification = document.createElement('div');
        notification.textContent = `Sold contract ${contractId}: ${reason}`;
        document.getElementById('notifications-list').appendChild(notification);
    }

    function saveContractData(contract) {
        const contractData = activeContracts[contract.contract_id];
        const endTime = new Date();
        const duration = (endTime - contractData.startTime) / 1000;
        const profitTimes = contractData.plHistory.filter(entry => entry.pl > 0).map(entry => ({
            time: entry.time.toISOString(),
            profit: entry.pl
        }));
        const performance = {
            contractId: contract.contract_id,
            symbol: contract.underlying,
            startTime: contractData.startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`,
            profit: contract.profit,
            profitTimes,
            reason: contract.status === 'sold' ? 'Sold' : 'Expired'
        };
        let history = JSON.parse(localStorage.getItem('contractHistory')) || [];
        history.push(performance);
        localStorage.setItem('contractHistory', JSON.stringify(history));
        updateSummary();
    }

    function updateSummary() {
        const history = JSON.parse(localStorage.getItem('contractHistory')) || [];
        const daily = history.filter(entry => new Date(entry.endTime).toDateString() === new Date().toDateString());
        const weekly = history.filter(entry => {
            const end = new Date(entry.endTime);
            const now = new Date();
            return now - end < 7 * 24 * 60 * 60 * 1000;
        });
        const thresholds = {};
        history.forEach(entry => {
            const profit = Math.round(entry.profit / 10) * 10;
            thresholds[profit] = (thresholds[profit] || 0) + 1;
        });
        const mostRepeated = Object.entries(thresholds).sort((a, b) => b[1] - a[1])[0];

        document.getElementById('summary-content').innerHTML = `
            <p>Daily Contracts: ${daily.length}</p>
            <p>Weekly Contracts: ${weekly.length}</p>
            <p>Most Repeated Profit Threshold: ${mostRepeated ? mostRepeated[0] : 'N/A'} (${mostRepeated ? mostRepeated[1] : 0} times)</p>
        `;
    }

    // Future enhancement placeholder
    window.addEventListener('message', function(event) {
        if (event.data === 'startmanage') {
            const config = { useDefault: true, appId: '1089', token: 'pfm6nudgLi4aNys', takeProfit: null, stopLoss: null, highTolerance: false, lowTolerance: true };
            localStorage.setItem('config', JSON.stringify(config));
            startBot();
        }
    });
});