Raccoon
====

Utility for deployment site from git.

### Usage :shipit:
	coon <help | version>

	coon clear - removes hook scripts and deploy configs

	coon show <configs | hosts | deploys>

	coon add <host-config-name> with <deploy-config-name>
	    [-w] for wizard, or 
	    [--ssh-host <ssh-host>] [--ssh-user <ssh-user>] [--ssh-privatekey <ssh-path-to-private-key>] [--ssh-port <ssh-port>] 
	    [--branch <branch-name>] [--build-command <build command>] [--source <source>] [--target <target>] [--delta-mode <true | false>]  

	coon add host <host-config-name>
	    [-w] for wizard, or
	    [--ssh-host <ssh-host>] [--ssh-user <ssh-user>] [--ssh-privatekey <ssh-path-to-private-key>] [--ssh-port <ssh-port>]

	coon add deploy <deploy-config-name>
	    [-w] for wizard, or
	    [--branch <branch-name>] [--build-command <build command>] [--source <source>] [--target <target>] [--delta-mode <true | false>]  

	coon remove all <hosts | deploys>

	coon remove host <name>

	coon remove deploy <name>

	coon edit <deploy | host> <name>
	    [-w] for wizard, or
	    [--ssh-host <ssh-host>] [--ssh-user <ssh-user>] [--ssh-privatekey <ssh-path-to-private-key>] [--ssh-port <ssh-port>] 
	    [--branch <branch-name>] [--build-command <build command>] [--source <source>] [--target <target>] [--delta-mode <true | false>]  

	coon build <deploy-name>
	    [--branch <branch-name>] [--build-command <build command>] [--source <source>] [--target <target>] [--delta-mode <true | false>]

	coon deploy <deploy-name> to <host-name>
	    [--ssh-host <ssh-host>] [--ssh-user <ssh-user>] [--ssh-privatekey <ssh-path-to-private-key>] [--ssh-port <ssh-port>] 
	    [--branch <branch-name>] [--build-command <build command>] [--source <source>] [--target <target>] [--delta-mode <true | false>] 
	    
	coon bind <deploy-name> to <host-name>
	    [--ssh-host <ssh-host>] [--ssh-user <ssh-user>] [--ssh-privatekey <ssh-path-to-private-key>] [--ssh-port <ssh-port>] 
	    [--branch <branch-name>] [--build-command <build command>] [--source <source>] [--target <target>] [--delta-mode <true | false>] 

	coon unbind <deploy-name> [from <host-name>]

