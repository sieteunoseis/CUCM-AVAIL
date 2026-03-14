I want to build a dashboard to show the effects of Call Manager groups.

We should use

https://www.npmjs.com/package/cisco-axl

https://www.npmjs.com/package/cisco-risport

and Cisco serviceability API.

We would axl to get all the servers from the publisher. We'd then check serviceability to check if the service "Cisco Call Manager" is running. We can note that. Next we'd use AXL to get all the CMG groups. We would then save all the Cisco Phones to an SQL db and note name, device pool, cmg server 1, cmg server 2, cmg server 3. we can then query risport every 15 mins to see what server its registered to. I would like the switch on teh dashboard to show if i lost a server what would happend? if it was server 1 in a cmg group phones would quickly re register. if it was further down in the CMG group nothing would happen unless more were lost. Then i can test if we lost two or more and what would happen to phones.