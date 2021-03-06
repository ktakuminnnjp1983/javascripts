console.log("##### Read client #####");

var slideWidth = 700;
var slideHeight = 500;
var slidePages = 10;

Meteor.startup(function() {
    Meteor.subscribe("watchers");
    Meteor.subscribe("masterSlideNo");
    Meteor.subscribe("opinions");
    Meteor.subscribe("slideImgs");
    Meteor.subscribe("comments");

    Meteor.call("hello", "test");
    var user_id = Watchers.insert(
        {
            last_keepalive: (new Date()).getTime()
        }
    );
    Meteor.setInterval(function(){
        Watchers.update(
            {_id: Session.get("user_id")},
            {$set: {last_keepalive: (new Date()).getTime()}}
        );
    }, 1000);
    
    Session.set("user_id", user_id);
    Session.set("numOfComments", Comments.find().count());
    Session.set("currentSlideNo", 0);
    Session.set("commentsFilter", "all");
    Session.set("syncMode", false);
    Meteor.autorun(function(){ // templateでも同様にできるはず
        console.log("autorunexec");
        var filter = Session.get("commentsFilter");
        var numOfComments = Session.get("numOfComments");
        var currentSlideNo = Session.get("currentSlideNo");

        $("#commentContainer").html("");
        
        var cursor = Comments.find({}, {sort: {no: -1}});
        var count = cursor.count();
        console.log("$$$ helper %s %d$$$", "commentsArea", cursor.count());

        cursor.forEach(function(comment){
           $div = $('<div data-comment-id="' + comment.no + '" data-target-slide-no="' + comment.targetSlideNo + '"></div>');
           $div.attr("class", "acomment");
           $div.text(comment.no + " : " + comment.comment + ":(targetSlide" + comment.targetSlideNo + ")");
           $("#commentContainer").append($div);
        });

        $(".acomment").each(function(){
            if(filter == "all"){
                $(this).css("display", "block");
            } else if($(this).data("targetSlideNo") == currentSlideNo){
                $(this).css("display", "block");
            } else{
                $(this).css("display", "none");
            }
        });
    });
    
});

$(function(){
    console.log("##### DOM Ready #####");
    if(location.hash == "#master"){
        document.title = "発表者";
    } else{
        document.title = "一般";
    }

    $("#viewport").css({
        width: slideWidth + "px",
        height: slideHeight + "px"
    });
    $("#flipsnap").css({
        width: (slideWidth * slidePages) + "px",
        height: slideHeight + "px"
    });
    $(".canvasWrapper").css({
        width: slideWidth + "px",
        height: slideHeight + "px"
    });
    $("canvas").each(function(){
        this.width = slideWidth;
        this.height = slideHeight;
    });


    $("#commentsFilter").change(function(e){
        Session.set("commentsFilter", $(this).attr("value"));
    });

    $("#commentSubmit").click(function(e){
        var comment = $("#commentsArea").val();
        if(comment === ""){
            return ;
        }
        
        comment = comment.replace(/\r?\n/g, "<br/>");
        var commentCanvasID = "ccanvas_" + getCurrentSlideNo();
        Comments.insert({
            no: -1,
            comment: comment,
            targetSlideNo: getCurrentSlideNo(),
            targetSlideSnapShot: getCanvasSnapShotURL(commentCanvasID)  
        });
       
        updateCanvas(commentCanvasID, "");

        // コメント入力後にスライドを同期
        if(!isMaster() && getMasterSlideNo() != getCurrentSlideNo() && Session.get("syncMode")){
            setCurrentSlideNo(getMasterSlideNo());
        }
       
        $("#commentsArea").val("");
    });

    $("#commentsArea").focusout(function(){
        // コメント入力後にスライドを同期
        if(!isMaster() && getMasterSlideNo() != getCurrentSlideNo() && Session.get("syncMode") && $(this).val().length === 0){
            setCurrentSlideNo(getMasterSlideNo());
        }
    });
    
    g_flipsnap = Flipsnap("#flipsnap");
    g_flipsnap.element.addEventListener("fspointmove", function(a,i){
        $("#notextbox").val(getCurrentSlideNo());
            setCurrentSlideNo(getCurrentSlideNo());
        if(isMaster()){
            setMasterSlideNo(getCurrentSlideNo());
        }
    }, false);

    $("#muteCheck").change(function(e){
        var audio = $("#audio").eq(0).get(0);
        audio.muted = e.target.checked;
    });
    if(isMaster()){
        $("#muteArea").css("display", "none");
    }

    $(".masterCanvas,.commentCanvas").each(function(el){
        $(this).on("mousemove touchmove", function(e){
            if(getSlideMode() == "slide"){
                return true;
            }
            e.stopPropagation();
            e.preventDefault();

            var pageX = e.originalEvent.touches ? e.originalEvent.touches[0].pageX : e.pageX;
            var pageY = e.originalEvent.touches ? e.originalEvent.touches[0].pageY : e.pageY;

            var startX = $.data(this, "px");
            var startY = $.data(this, "py");
            var off = $(this).offset();
            var offsetX = pageX - off.left; 
            var offsetY = pageY - off.top;
            if($.data(this, "mousedowning") && startX != null && startY != null){ 
                var context = this.getContext("2d");
                context.beginPath();             // パスのリセット
                context.lineWidth = getSlideMode() == "erase" ? 15 : 5;           // 線の太さ
                context.strokeStyle= isMaster() ? "#ff0000" : "#0000ff";   // 線の色
                context.moveTo(startX, startY);           // 開始位置
                context.lineTo(offsetX, offsetY);         // 次の位置
                context.stroke();    
                // console.log("%d %d %d %d", startX, startY, offsetX, offsetY);

                if(isMaster()){
                    var obj ={
                        key: "canvasStroke",
                        val: {
                            id: $(this).attr("id"),
                            x: offsetX,
                            y: offsetY,
                            mode: getSlideMode() 
                        }
                    };
                    g_socket.send(JSON.stringify(obj));
                }
            }    

            $.data(this, "px", offsetX);
            $.data(this, "py", offsetY);
        });
        $(this).on("mousedown touchstart", function(e){
            if(getSlideMode() == "slide"){
                return true;
            }
            e.stopPropagation();
            
            var context = this.getContext("2d");
            if(getSlideMode() == "erase"){
                context.globalCompositeOperation = "destination-out";
            } else{
                context.globalCompositeOperation = "source-over";
            }
            
            $.data(this, "mousedowning", true);
        });
        $(this).on("mouseup touchend", function(e){
            if(getSlideMode() == "slide"){
                return true;
            }
            e.stopPropagation();
            
            $.data(this, "mousedowning", false);
            $.data(this, "px", null);
            $.data(this, "py", null);
            if(!isMaster()){
                return true;
            }
            var obj ={
                key: "canvasStroke",
                val: {
                    id: $(this).attr("id"),
                    x: -1,
                    y: -1
                }
            };
            console.log(e.target.id);
            var id = e.target.id;
            var snapshotURL = getCanvasSnapShotURL(e.target);
            updateSlideDataURL(id, snapshotURL);

            this.getContext("2d").globalCompositeOperation = "source-over";
            g_socket.send(JSON.stringify(obj));
        });
        $(this).on("mouseleave", function(e){
            if(getSlideMode() == "slide"){
                return true;
            }
            e.stopPropagation();
            
            $.data(this, "px", null);
            $.data(this, "py", null);
            $.data(this, "mousedowning", false);
            this.getContext("2d").globalCompositeOperation = "source-over";
            if(isMaster()){
                var obj ={
                    key: "canvasStroke",
                    val: {
                        id: $(this).attr("id"),
                        x: -1,
                        y: -1
                    }
                };
                g_socket.send(JSON.stringify(obj));
            }
        });
    });

    $(document).on("click", ".acomment", function(e){
        var commentID = Number($(this).data("commentId"));
        selectComment(commentID);
        if(isMaster()){
            // 選択されたコメントIDをブロードキャスト
            var obj = {
                key: "selectedComment",
                val: {
                    commentID: commentID
                }
            };
            g_socket.send(JSON.stringify(obj));
        }
        return true;
    });

    // $("#mainFrame").resizable({handles: "e"});
    
});

// memo
//db.comments.find({targetSlideNo:{$gte:0,$lte:1}})
//
