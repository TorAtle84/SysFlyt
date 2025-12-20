Parsing Rules for String Structure: The string is composed of four ordered segments: {Byggnr}{System}{Komponent}{Typekode}.

    Byggnr (Optional)

        Start: Always starts with +.

        Content: Contains digits.

        End: Ends immediately before = or at the end of the string (if no other segments follow).

        Note: This segment does not always appear in projects.

    System (Mandatory)

        Start: If Byggnr is present, this starts with =. It typically starts with =, but is not strictly limited to it.

        Content: Normally consists of 3-4 digits, followed by ., followed by 3-4 digits.

        Suffix: Sometimes a suffix occurs at the end containing :, followed by 2-4 digits.

        End: Ends immediately before - or at the end of the string.

    Komponent (Mandatory)

        Start: May start with - (but is not limited to this).

        Content: The component identifier itself always starts with 2-3 letters, followed by digits.

        Variation: The digits may be split by letters or special characters.

        End: Ends immediately before % or at the end of the string.

    Typekode (Optional/Conditional)

        Start: Always starts with %.

        Content: Followed by 2-3 letters.

        End: Terminates at the end of the string.

Option 2: Direct Text (Paragraph Form)

Byggnr = Always starts with +, followed by digits, and ends immediately before =, or at nothing/end of string (this part does not always appear in projects, but sometimes).

System = If Byggnr is present, the system will always start with =, or it can start with = but is not limited to it. Then, it is normally followed by 3-4 digits, followed by ., followed by 3-4 digits before it ends immediately before - or nothing. However, sometimes it may occur that : is at the end followed by 2-4 digits, before - or nothing (this system part always appears in projects).

Komponent = Can start with -, but not limited to it. The component itself always starts with 2-3 letters, followed by digits, which can sometimes be split by letters or special characters. It ends either at nothing or immediately before % (this part always appears in projects).

Typekode = Always starts with %, followed by 2-3 letters, and naturally ends with nothing.

The segments always follow this order: {Byggnr}{System}{Komponent}{Typekode}.