var d = app.documents.getByName("M2-A.ai"); d.save(); d.close(SaveOptions.DONOTSAVECHANGES); "closed; docs open=" + app.documents.length;
