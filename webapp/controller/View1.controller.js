// ═══════════════════════════════════════════
// Tambahkan ke View1.controller.js — di onInit (paling akhir)
// dan setelah _loadConsultants/_loadTickets selesai
// ═══════════════════════════════════════════

sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, Filter, FilterOperator) {
    "use strict";

    var STATUS_LABEL = { NW: "New", AS: "Assigned", IP: "In Progress", PD: "Pending", CL: "Closed" };
    var STATUS_STATE = { NW: "None", AS: "Information", IP: "Success", PD: "Warning", CL: "None" };
    var PRIORITY_LABEL = { H: "High", M: "Medium", L: "Low" };
    var REFRESH_INTERVAL = 60000;

    return Controller.extend("com.ztkt.assignment.controller.View1", {

        _consultantMap: {},
        _refreshTimer: null,

        onInit: function () {
            var oKpi = new JSONModel({
                ongoing: 0, pending: 0, standby: 0, overdue: 0,
                supCount: 0, crCount: 0,
                backlogText: "Loading…", backlogState: "None",
                newToday: 0
            });
            this.getView().setModel(oKpi, "kpi");

            this._applyStatusFilters();
            this._loadAll();

            this._refreshTimer = setInterval(function () {
                this._loadAll();
            }.bind(this), REFRESH_INTERVAL);
        },

        // ═══ Apply status filter (AS, IP, PD) ke tabel Support & CR ═══
        _applyStatusFilters: function () {
            var oFilterActive = new Filter({
                filters: [
                    new Filter("Status", FilterOperator.EQ, "AS"),
                    new Filter("Status", FilterOperator.EQ, "IP"),
                    new Filter("Status", FilterOperator.EQ, "PD")
                ],
                and: false   // OR antar status
            });

            // Support: TYPE = SUP AND Status IN (AS, IP, PD)
            var oSupFilter = new Filter({
                filters: [
                    new Filter("Type", FilterOperator.EQ, "SUP"),
                    oFilterActive
                ],
                and: true
            });
            var tblS = this.byId("tblSupport");
            if (tblS && tblS.getBinding("items")) {
                tblS.getBinding("items").filter([oSupFilter]);
            }

            // CR: TYPE = CR AND Status IN (AS, IP, PD)
            var oCrFilter = new Filter({
                filters: [
                    new Filter("Type", FilterOperator.EQ, "CR"),
                    oFilterActive
                ],
                and: true
            });
            var tblC = this.byId("tblCR");
            if (tblC && tblC.getBinding("items")) {
                tblC.getBinding("items").filter([oCrFilter]);
            }
        },

        onExit: function () {
            if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
        },

        _loadAll: function () {
            this._loadConsultants();
            this._loadTickets();
            this._refreshTables();
            // Re-apply filter setelah refresh
            this._applyStatusFilters();
        },

        _refreshTables: function () {
            var ids = ["tblSupport", "tblCR", "tblBacklog", "lstNewTickets", "lstStandby"];
            ids.forEach(function (id) {
                var ctrl = this.byId(id);
                if (ctrl && ctrl.getBinding("items")) {
                    ctrl.getBinding("items").refresh(true);
                }
            }.bind(this));
        },

        _loadConsultants: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oKpi = this.getView().getModel("kpi");
            var that = this;
            oModel.read("/ConsultantSet", {
                success: function (oData) {
                    var iStandby = 0;
                    oData.results.forEach(function (c) {
                        that._consultantMap[c.ConsId] = c.Name;
                        if (c.Status === "A") iStandby++;
                    });
                    oKpi.setProperty("/standby", iStandby);
                }
            });
        },

        _loadTickets: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oKpi = this.getView().getModel("kpi");
            oModel.read("/TicketSet", {
                urlParameters: { "$top": "5000" },
                success: function (oData) {
                    var iOngoing = 0, iPending = 0, iBacklog = 0;
                    var iSupCount = 0, iCRCount = 0, iNewToday = 0;
                    var today = new Date();
                    today.setHours(0, 0, 0, 0);

                    oData.results.forEach(function (t) {
                        var s = t.Status;
                        var bActive = s === "AS" || s === "IP" || s === "PD";
                        if (s === "IP" || s === "AS") iOngoing++;
                        if (s === "PD") iPending++;
                        if (s === "NW") iBacklog++;
                        if (bActive && t.Type === "SUP") iSupCount++;
                        if (bActive && t.Type === "CR") iCRCount++;
                        if (t.CreatedAt) {
                            var d = new Date(t.CreatedAt);
                            d.setHours(0, 0, 0, 0);
                            if (d.getTime() === today.getTime()) iNewToday++;
                        }
                    });

                    oKpi.setProperty("/ongoing", iOngoing);
                    oKpi.setProperty("/pending", iPending);
                    oKpi.setProperty("/overdue", 0);
                    oKpi.setProperty("/supCount", iSupCount);
                    oKpi.setProperty("/crCount", iCRCount);
                    oKpi.setProperty("/newToday", iNewToday);
                    oKpi.setProperty("/backlogText", iBacklog + (iBacklog === 1 ? " ticket" : " tickets"));
                    oKpi.setProperty("/backlogState", iBacklog > 0 ? "Error" : "Success");
                }
            });
        },

        formatConsName: function (sConsId, sModuleId) {
            return (sModuleId || "") + " - " + (this._consultantMap[sConsId] || sConsId);
        },
        formatStatusLabel: function (s) { return STATUS_LABEL[s] || s; },
        formatInitials: function (sName) {
    if (!sName) { return "?"; }
    var aParts = sName.trim().split(/\s+/);
    var sInit = aParts[0].charAt(0);
    if (aParts.length > 1) { sInit += aParts[aParts.length - 1].charAt(0); }
    return sInit.toUpperCase();
},
        formatStatusState: function (s) { return STATUS_STATE[s] || "None"; },
        formatPriorityLabel: function (p) { return PRIORITY_LABEL[p] || p; },
        onSideNavButtonPress: function () { },
        onItemSelect: function (oEvent) {
            console.log("Menu:", oEvent.getParameter("item").getKey());
        }

    });
});