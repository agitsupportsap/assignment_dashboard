sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("com.ztkt.assignment.controller.View1", {

        onInit: function () {
            // Inject custom CSS for full-screen layout
            var sCss = ".sapMPage > section { padding: 0 !important; }" +
                       ".sapMPanel { margin-bottom: 0 !important; }";
            var oStyle = document.createElement("style");
            oStyle.appendChild(document.createTextNode(sCss));
            document.head.appendChild(oStyle);
        },

        onSideNavButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            var bSideExpanded = oToolPage.getSideExpanded();
            oToolPage.setSideExpanded(!bSideExpanded);
        },

        onItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            console.log("Menu clicked:", sKey);
        }

    });
});