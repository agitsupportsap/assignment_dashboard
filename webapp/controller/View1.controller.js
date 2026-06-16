sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter) {
    "use strict";

    var STATUS_LABEL = { NW: "New", AS: "Assigned", IP: "In Progress", PD: "Pending", CL: "Closed" };
    var PRIORITY_LABEL = { H: "High", M: "Medium", L: "Low" };
    var REFRESH_INTERVAL = 60000;

    return Controller.extend("com.ztkt.assignment.controller.View1", {

        _consultantMap: {},
        _refreshTimer: null,
        _oNewTpl: null,

        onInit: function () {
            var oKpi = new JSONModel({
                ongoing: 0, pending: 0, standby: 0, overdue: 0,
                supCount: 0, crCount: 0,
                backlogText: "Loading…", backlogState: "None",
                newToday: 0
            });
            this.getView().setModel(oKpi, "kpi");
            this.getView().setModel(new JSONModel({ items: [] }), "standbyModel");

            this._bindNewToday();
            this._loadAll();

            this._refreshTimer = setInterval(function () {
                this._loadAll();
            }.bind(this), REFRESH_INTERVAL);
        },

        onExit: function () {
            if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
        },

        // ═══ New Tickets Today — filter dinamis CreatedAt >= today 00:00 ═══
        _bindNewToday: function () {
            var oList = this.byId("lstNewTickets");
            if (!oList) { return; }

            // simpan template dari XML sekali (cliNewTpl)
            if (!this._oNewTpl) {
                var oBI = oList.getBindingInfo("items");
                if (oBI && oBI.template) {
                    this._oNewTpl = oBI.template;
                } else {
                    var aItems = oList.getItems();
                    if (aItems.length) {
                        this._oNewTpl = aItems[0].clone();
                    }
                }
            }
            if (!this._oNewTpl) { return; }

            var d = new Date();
            d.setHours(0, 0, 0, 0);

            oList.bindItems({
                path: "/TicketSet",
                filters: [ new Filter("CreatedAt", FilterOperator.GE, d) ],
                sorter: new Sorter("CreatedAt", true),
                template: this._oNewTpl,
                templateShareable: true
            });
        },

        _loadAll: function () {
            this._loadConsultantsAndStandby();
            this._loadTickets();
            this._refreshStaticTables();
        },

        _refreshStaticTables: function () {
            var ids = ["tblSupport", "tblCR", "tblPending", "tblBacklog"];
            ids.forEach(function (id) {
                var ctrl = this.byId(id);
                if (ctrl && ctrl.getBinding("items")) {
                    ctrl.getBinding("items").refresh(true);
                }
            }.bind(this));
            this._bindNewToday();
        },

        // ═══ Standby = consultant aktif yang TIDAK punya ticket AS/IP/PD ═══
        _loadConsultantsAndStandby: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oKpi = this.getView().getModel("kpi");
            var oStandby = this.getView().getModel("standbyModel");
            var that = this;

            oModel.read("/ConsultantSet", {
                success: function (oConsData) {
                    var aActiveCons = [];
                    oConsData.results.forEach(function (c) {
                        that._consultantMap[c.ConsId] = c.Name;
                        if (c.Status === "A") { aActiveCons.push(c); }
                    });

                    oModel.read("/TicketSet", {
                        urlParameters: {
                            "$filter": "Status eq 'AS' or Status eq 'IP' or Status eq 'PD'",
                            "$select": "ConsId,Status",
                            "$top": "5000"
                        },
                        success: function (oTk) {
                            var oBusy = {};
                            (oTk.results || []).forEach(function (t) {
                                if (t.ConsId) { oBusy[t.ConsId] = true; }
                            });

                            var aStandby = aActiveCons
                                .filter(function (c) { return !oBusy[c.ConsId]; })
                                .map(function (c) {
                                    return {
                                        consId:   c.ConsId,
                                        name:     c.Name,
                                        module:   c.ModuleId,
                                        initials: that.formatInitials(c.Name)
                                    };
                                });

                            oStandby.setProperty("/items", aStandby);
                            oKpi.setProperty("/standby", aStandby.length);
                        }
                    });
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
                        var bActiveAssign = s === "AS" || s === "IP";
                        if (s === "IP" || s === "AS") iOngoing++;
                        if (s === "PD") iPending++;
                        if (s === "NW") iBacklog++;
                        if (bActiveAssign && t.Type === "SUP") iSupCount++;
                        if (bActiveAssign && t.Type === "CR") iCRCount++;
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
        formatPriorityLabel: function (p) { return PRIORITY_LABEL[p] || p; },

        formatInitials: function (sName) {
            if (!sName) { return "?"; }
            var aParts = sName.trim().split(/\s+/);
            var sInit = aParts[0].charAt(0);
            if (aParts.length > 1) { sInit += aParts[aParts.length - 1].charAt(0); }
            return sInit.toUpperCase();
        },

        formatStatusIcon: function (s) {
            switch (s) {
                case "AS": return "sap-icon://inbox";
                case "IP": return "sap-icon://busy";
                case "PD": return "sap-icon://pause";
                default:   return "sap-icon://circle-task";
            }
        },
        formatStatusColor: function (s) {
            switch (s) {
                case "AS": return "#0284c7";
                case "IP": return "#16a34a";
                case "PD": return "#d97706";
                default:   return "#7b8794";
            }
        },

        formatSlaText: function (sStatus, sEstimate, nRemaining) {
            if (sStatus !== "IP") { return "—"; }
            if (!sEstimate) { return "n/a"; }
            var nHrs = parseFloat(nRemaining || 0);
            if (sEstimate === "WITHIN") {
                return "Within · " + nHrs.toFixed(1) + "h";
            }
            return "Breach · " + Math.abs(nHrs).toFixed(1) + "h over";
        },
        formatSlaState: function (sStatus, sEstimate) {
            if (sStatus !== "IP" || !sEstimate) { return "None"; }
            return sEstimate === "WITHIN" ? "Success" : "Error";
        }

    });
});