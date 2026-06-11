sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    var SLA_DAYS = { SUP: 3, CR: 7 };

    return Controller.extend("com.ztkt.assignment.controller.View2", {

        _consultantMap: {},

        onInit: function () {
            var oKpi = new JSONModel({
                finishedTotal: 0, finishedSup: 0, finishedCr: 0, finishedAvgDay: 0,
                slaWithinText: "0 (0%)", slaBreachText: "0 (0%)",
                slaWithinPct: 0, slaAvgDays: "0.0"
            });
            this.getView().setModel(oKpi, "kpi");
            this.getView().setModel(new JSONModel({ items: [] }), "custModel");
            this.getView().setModel(new JSONModel({ items: [] }), "leaderModel");

            this._loadConsultants(function () {
                this._loadAll();
            }.bind(this));
        },

        _loadConsultants: function (fnDone) {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            oModel.read("/ConsultantSet", {
                success: function (oData) {
                    oData.results.forEach(function (c) {
                        that._consultantMap[c.ConsId] = { name: c.Name, module: c.ModuleId };
                    });
                    if (fnDone) { fnDone(); }
                },
                error: function () { if (fnDone) { fnDone(); } }
            });
        },

        _loadAll: function () {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            oModel.read("/TicketSet", {
                success: function (oData) {
                    var aTickets = oData.results || [];
                    that._loadFinishedKpi(aTickets);
                    that._loadSlaSummary(aTickets);
                    that._loadCustomerSummary(aTickets);
                    that._loadLeaderboard(aTickets);
                }
            });
        },

        _loadFinishedKpi: function (aTickets) {
            var oKpi = this.getView().getModel("kpi");
            var iTotal = 0, iSup = 0, iCr = 0;
            var oMinDate = null, oMaxDate = null;

            aTickets.forEach(function (t) {
                if (t.CreatedAt) {
                    var d = new Date(t.CreatedAt);
                    if (!oMinDate || d < oMinDate) { oMinDate = d; }
                    if (!oMaxDate || d > oMaxDate) { oMaxDate = d; }
                }
                if (t.Status !== "CL") { return; }
                iTotal++;
                if (t.Type === "SUP") { iSup++; }
                if (t.Type === "CR")  { iCr++;  }
            });

            var nRange = (oMinDate && oMaxDate)
                ? Math.max(1, Math.ceil((oMaxDate - oMinDate) / 86400000)) : 1;
            var nAvgDay = iTotal > 0 ? (iTotal / nRange) : 0;

            oKpi.setProperty("/finishedTotal",  iTotal);
            oKpi.setProperty("/finishedSup",    iSup);
            oKpi.setProperty("/finishedCr",     iCr);
            oKpi.setProperty("/finishedAvgDay", parseFloat(nAvgDay.toFixed(1)));
        },

        _loadSlaSummary: function (aTickets) {
            var oKpi = this.getView().getModel("kpi");
            var iWithin = 0, iBreach = 0;
            var nSupDaySum = 0, iSupCnt = 0;

            aTickets.forEach(function (t) {
                if (t.Status !== "CL") { return; }
                if (t.CreatedAt && t.ClosedAt) {
                    var nDays = (new Date(t.ClosedAt) - new Date(t.CreatedAt)) / 86400000;
                    var iLimit = SLA_DAYS[t.Type] || 5;
                    if (nDays <= iLimit) { iWithin++; } else { iBreach++; }
                    if (t.Type === "SUP") { nSupDaySum += nDays; iSupCnt++; }
                } else {
                    iWithin++;
                }
            });

            var iTotal = iWithin + iBreach;
            var iPct       = iTotal > 0 ? Math.round(iWithin * 100 / iTotal) : 0;
            var iBreachPct = iTotal > 0 ? (100 - iPct) : 0;
            var nAvg       = iSupCnt > 0 ? (nSupDaySum / iSupCnt) : 0;

            oKpi.setProperty("/slaWithinText", iWithin + " (" + iPct + "%)");
            oKpi.setProperty("/slaBreachText", iBreach + " (" + iBreachPct + "%)");
            oKpi.setProperty("/slaWithinPct",  iPct);
            oKpi.setProperty("/slaAvgDays",    nAvg.toFixed(1));
        },

        _loadCustomerSummary: function (aTickets) {
            var oCust  = this.getView().getModel("custModel");
            var oGroup = {};

            aTickets.forEach(function (t) {
                var k = t.CustCode;
                if (!oGroup[k]) { oGroup[k] = { cust: k, sup: 0, cr: 0, total: 0, pct: 0 }; }
                if (t.Type === "SUP") { oGroup[k].sup++; }
                if (t.Type === "CR")  { oGroup[k].cr++;  }
                oGroup[k].total = oGroup[k].sup + oGroup[k].cr;
            });

            var aRows = Object.keys(oGroup).map(function (k) { return oGroup[k]; });
            aRows.sort(function (a, b) { return b.total - a.total; });
            var iMax = aRows.length > 0 ? aRows[0].total : 1;
            aRows.forEach(function (r) { r.pct = Math.round(r.total * 100 / iMax); });

            oCust.setProperty("/items", aRows);
        },

        _calcTicketCredit: function (t) {
            var base  = t.Type === "CR" ? 4 : 2;
            var prio  = t.Priority === "H" ? 3 : (t.Priority === "M" ? 2 : 1);
            var bonus = t.Rating  || 0;
            return base + prio + bonus;
        },

        _loadLeaderboard: function (aTickets) {
            var oLeader  = this.getView().getModel("leaderModel");
            var oConsMap = this._consultantMap;
            var oMap     = {};
            var that     = this;

            aTickets.forEach(function (t) {
                if (t.Status !== "CL" || !t.ConsId) { return; }
                if (!oMap[t.ConsId]) { oMap[t.ConsId] = { cnt: 0, creditSum: 0 }; }
                oMap[t.ConsId].cnt++;
                oMap[t.ConsId].creditSum += that._calcTicketCredit(t);
            });

            var aResults = Object.keys(oMap).map(function (sId) {
                return { ConsId: sId, CreditPoints: oMap[sId].creditSum, TicketCount: oMap[sId].cnt };
            });
            aResults.sort(function (a, b) { return b.CreditPoints - a.CreditPoints; });

            var aRows = aResults.map(function (r, i) {
                var oC      = oConsMap[r.ConsId] || {};
                var nCredit = parseFloat(r.CreditPoints || 0);
                var iTk     = parseInt(r.TicketCount  || 0, 10);
                var nAvg    = iTk > 0 ? (nCredit / iTk) : 0;  // avg credit per closed ticket

                var sRankClass = i === 0 ? "rankGold" : (i === 1 ? "rankSilver" : (i === 2 ? "rankBronze" : "rankPlain"));
                var sName = oC.name || r.ConsId;
                var aParts = sName.trim().split(/\s+/);
                var sInit = aParts[0].charAt(0);
                if (aParts.length > 1) { sInit += aParts[aParts.length - 1].charAt(0); }

                return {
                    rank:         String(i + 1),
                    rankState:    i === 0 ? "Warning" : (i < 3 ? "Information" : "None"),
                    rankClass:    sRankClass,
                    initials:     sInit.toUpperCase(),
                    consId:       r.ConsId,
                    display:      sName + (oC.module ? " (" + oC.module + ")" : ""),
                    tickets:      iTk,
                    avgCredit:    nAvg.toFixed(1),
                    creditPoints: nCredit.toFixed(1)
                };
            });

            oLeader.setProperty("/items", aRows);
        }

    });
});
