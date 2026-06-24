sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("com.ztkt.assignment.controller.App", {

        onSideNavButtonPress: function () {
            var oToolPage = this.byId("toolPage1");
            if (!oToolPage) { return; }
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oRouter = this.getOwnerComponent().getRouter();
            if (sKey === "assignment") {
                oRouter.navTo("assignment");
            } else if (sKey === "performance") {
                oRouter.navTo("performance");
            }
        }

    });
});